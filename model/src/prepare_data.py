# prepare_data.py
# Script to run during RunPod build process (called by Dockerfile)
# Replicates logic from TS prepareTrainingData.ts

import requests
import json
import os
import sys
import subprocess
from collections import defaultdict
import random
import numpy as np
import math # For frequency power calculation

# Import RunPodLogger
try:
    from runpod import RunPodLogger
    log = RunPodLogger()
except ImportError:
    class MockLogger:
        def info(self, message): print(f"INFO: {message}")
        def error(self, message): print(f"ERROR: {message}", file=sys.stderr)
        def warn(self, message): print(f"WARN: {message}", file=sys.stderr)
        def debug(self, message): print(f"DEBUG: {message}")
    log = MockLogger()

# --- Configuration (Match TS logic) ---
MIN_TAG_FREQUENCY_FOR_VOCAB = 50
NEGATIVE_SAMPLING_RATIO = 5

# Note: MODEL_SAVE_DIR and VOCAB_SAVE_PATH are passed as arguments from the Dockerfile ENV vars

# Temporary file for data transfer between prepare_data.py and train_model.py
DATA_TEMP_PATH = "/workspace/temp_training_data.json" # Temp file inside the container

# --- Data Fetching Function (Adjusted for new API format) ---
def fetch_data_from_api(api_url: str):
    log.info(f"Build (prepare_data): Fetching data from API: {api_url}")
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        data = response.json() # Expecting [{ "id": 1, "tagString": "tag_a tag_b" }, ...]
        log.info(f"Build (prepare_data): Successfully fetched {len(data)} posts.")
        return data
    except requests.exceptions.RequestException as e:
        log.error(f"Build Error (prepare_data): Failed to fetch data from API: {e}")
        sys.exit(1) # Fail build
    except json.JSONDecodeError as e:
        log.error(f"Build Error (prepare_data): Failed to parse API response as JSON: {e}")
        sys.exit(1) # Fail build

# --- Vocabulary Building Function (Replicates TS logic) ---
def build_vocabulary_from_posts(posts: list) -> dict:
    log.info("Build (prepare_data): Building vocabulary from frequent tags and creating index mappings...")

    # 1. Count tag frequencies from posts
    log.info("Build (prepare_data): Counting tag frequencies...")
    tag_frequencies = defaultdict(int)

    for post in posts:
        tag_string = post.get("tagString")
        if not tag_string:
            continue
        tags_in_post = tag_string.split(" ")
        for tag_text in tags_in_post:
             if tag_text: # Ensure tag text is not empty after split
                 tag_frequencies[tag_text] += 1

    log.info(f"Build (prepare_data): Finished counting frequencies. Found {len(tag_frequencies)} unique tags.")

    # 2. Filter tags by frequency
    frequent_tag_texts = [
        tag_text for tag_text, count in tag_frequencies.items()
        if count >= MIN_TAG_FREQUENCY_FOR_VOCAB
    ]

    # Sort frequent tags (alphabetically for consistency, or by frequency if needed)
    frequent_tag_texts.sort()

    num_frequent_tags = len(frequent_tag_texts)
    if num_frequent_tags == 0:
        log.error(f"Build Error (prepare_data): No tags meeting frequency threshold ({MIN_TAG_FREQUENCY_FOR_VOCAB}) found to build vocabulary.")
        sys.exit(1) # Fail build

    log.info(f"Build (prepare_data): Found {num_frequent_tags} tags meeting frequency threshold.")

    # 3. Create Mapping from Tag Text to Model Index (0-indexed, reserving 0 for padding)
    # Model indices will be 1 to num_frequent_tags
    tag_text_to_model_index = {}
    model_index_to_tag_text = {}
    model_index_counter = 1 # Start assigning indices from 1

    for tag_text in frequent_tag_texts:
        tag_text_to_model_index[tag_text] = model_index_counter
        model_index_to_tag_text[str(model_index_counter)] = tag_text # Store as string key for JSON
        model_index_counter += 1

    final_vocabulary_size = num_frequent_tags + 1 # +1 for padding at index 0

    log.info(f"Build (prepare_data): Vocabulary size (for model): {final_vocabulary_size} ({num_frequent_tags} frequent tags + 1 padding).")
    log.info(f"Build (prepare_data): Mapping {num_frequent_tags} tag texts to model indices 1 to {num_frequent_tags}.")

    # 4. Create a list of MODEL INDICES repeated by frequency for sampling (Replicates TS logic)
    tag_model_indices_for_sampling = []
    # Iterate through frequent tags to build the sampling list
    for tag_text in frequent_tag_texts:
        model_index = tag_text_to_model_index[tag_text]
        freq = tag_frequencies[tag_text] # Get frequency by text
        num_samples = max(1, int(math.ceil(math.pow(freq, 0.75)))) # Frequency raised to 0.75 power, ensure at least 1 sample
        tag_model_indices_for_sampling.extend([model_index] * num_samples)

    if not tag_model_indices_for_sampling:
         log.error("Build Error (prepare_data): Vocabulary built, but no model indices available for sampling.")
         sys.exit(1) # Fail build


    log.info(f"Build (prepare_data): Prepared {len(tag_model_indices_for_sampling)} model indices for sampling.")

    # Return artifacts needed for subsequent steps
    return {
        "vocabulary_size": final_vocabulary_size,
        "tag_text_to_model_index": tag_text_to_model_index,
        "model_index_to_tag_text": model_index_to_tag_text,
        "tag_model_indices_for_sampling": tag_model_indices_for_sampling,
    }

# --- Training Data Generation Function (Replicates TS logic) ---
def generate_training_pairs_from_posts(posts: list, vocabulary_artifacts: dict) -> dict:
    log.info("Build (prepare_data): Preparing training data pairs...")

    tag_text_to_model_index = vocabulary_artifacts["tag_text_to_model_index"]
    tag_model_indices_for_sampling = vocabulary_artifacts["tag_model_indices_for_sampling"]
    vocabulary_size = vocabulary_artifacts["vocabulary_size"] # Not strictly needed here, but good context

    source_model_indices = []
    context_model_indices = []
    labels = []

    # List of all possible frequent tag model indices (excluding padding 0)
    all_frequent_model_indices = list(tag_text_to_model_index.values())
    # Using the weighted sampling list is more direct for negative sampling as per TS

    if not tag_model_indices_for_sampling:
         log.warn("Build (prepare_data): Sampling list is empty. Cannot generate pairs.")
         return { "sourceModelIndices": [], "contextModelIndices": [], "labels": [] }


    for post in posts:
        tag_string = post.get("tagString")
        if not tag_string:
            continue

        normalized_tags_in_post = tag_string.split(" ")
        # Convert tag text to MODEL INDICES, filtering out tags not in vocabulary
        tag_model_indices_in_post = [
            tag_text_to_model_index[tag_text] for tag_text in normalized_tags_in_post
            if tag_text in tag_text_to_model_index # Only include tags in our vocabulary
        ]

        if len(tag_model_indices_in_post) < 2:
            continue # Need at least two frequent tags for a pair

        # Use a Set for faster lookup of model indices in the current post
        tag_model_indices_in_post_set = set(tag_model_indices_in_post)

        # Generate Positive Pairs: Every tag with every other tag in the post
        for i in range(len(tag_model_indices_in_post)):
            source_index = tag_model_indices_in_post[i]

            for j in range(len(tag_model_indices_in_post)):
                if i == j: continue # Don't pair a tag with itself
                context_index = tag_model_indices_in_post[j]

                # Optional: Implement windowing here if POSITIVE_PAIR_WINDOW_SIZE > 0
                # This requires tracking original index or position in the tagString if order matters
                # Assuming order doesn't strictly matter based on simple TS example logic without windowing check here
                # If windowing IS required, the API might need to provide tags in order, or parse tagString with awareness of order

                source_model_indices.append(source_index)
                context_model_indices.append(context_index)
                labels.append(1.0) # Positive label

            # Generate Negative Pairs: For each source index, sample negative MODEL INDICES
            # Number of negative samples per source tag * number of tags in post
            num_negatives_for_this_source = NEGATIVE_SAMPLING_RATIO # * len(tag_model_indices_in_post) # TS multiplies by len(post_tags_ids) here

            # Sample negative context tags from the weighted list
            # Ensure the sampled tag is NOT in the current post
            # Replicate TS logic: For EACH source tag, sample NEGATIVE_SAMPLING_RATIO * num_tags_in_post negative contexts
            # And sample until the negative is NOT in the current post
            # This is inefficient if post has many tags. A simpler approach is to sample N unique negatives per post from outside the post tags.
            # Let's try to replicate the TS logic as described: For EACH source, generate N negatives * num_tags_in_post
            # This seems overly complex based on the TS code snippet. Let's re-read the TS code...
            # TS code: `for (let k = 0; k < NEGATIVE_SAMPLING_RATIO * tagModelIndicesInPost.length; k++) { ... sample negativeIndex ... sourceModelIndices.push(sourceIndex); contextModelIndices.push(negativeIndex); labels.push(0);}`
            # This means for EACH source tag (outer loop `i`), it tries to generate NEGATIVE_SAMPLING_RATIO * num_tags_in_post negative *pairs*. This seems wrong.
            # Let's assume the intent is to generate NEGATIVE_SAMPLING_RATIO negative contexts FOR EACH source tag.
            # Simplified interpretation: for each source tag in post, generate NEGATIVE_SAMPLING_RATIO negative pairs.

            for _ in range(NEGATIVE_SAMPLING_RATIO): # Generate N negative pairs for *this* source tag
                 negative_index = None
                 attempts = 0
                 max_attempts = len(tag_model_indices_for_sampling) * 2 # Prevent infinite loop on small vocabs

                 while attempts < max_attempts:
                      # Sample a negative index from the weighted pool
                      sampled_neg_index = random.choice(tag_model_indices_for_sampling)

                      # Check if it's NOT in the current post
                      if sampled_neg_index not in tag_model_indices_in_post_set:
                           negative_index = sampled_neg_index
                           break # Found a valid negative sample
                      attempts += 1

                 if negative_index is not None:
                      source_model_indices.append(source_index)
                      context_model_indices.append(negative_index)
                      labels.append(0.0) # Negative label
                 else:
                      log.warn(f"Build (prepare_data): Could not find a negative sample not in post after {max_attempts} attempts. Skipping some negative pairs for post ID {post.get('id', 'N/A')}")


    log.info(f"Build (prepare_data): Generated {len(labels)} training samples ({labels.count(1.0)} positive, {labels.count(0.0)} negative).")

    if not source_model_indices:
        log.error("Build Error (prepare_data): No training data generated after processing all posts.")
        sys.exit(1) # Fail build

    # Save training data to temporary file
    training_data = {
        "sourceModelIndices": source_model_indices,
        "contextModelIndices": context_model_indices,
        "labels": labels,
    }
    try:
        os.makedirs(os.path.dirname(DATA_TEMP_PATH), exist_ok=True)
        with open(DATA_TEMP_PATH, "w") as f:
            json.dump(training_data, f)
        log.info(f"Build (prepare_data): Training data saved to temporary file: {DATA_TEMP_PATH}")
    except Exception as e:
        log.error(f"Build Error (prepare_data): Failed to save temporary data file: {e}")
        sys.exit(1) # Fail build


# --- Main Execution for Build ---
if __name__ == "__main__":
    # Expecting API_DATA_URL, MODEL_SAVE_DIR, VOCAB_SAVE_PATH as arguments
    if len(sys.argv) != 4:
        log.error("Usage: python prepare_data.py <api_data_url> <model_save_dir> <vocab_save_path>")
        sys.exit(1)

    api_data_url = sys.argv[1]
    model_save_dir = sys.argv[2]
    vocab_save_path = sys.argv[3]

    # 1. Fetch Data
    all_posts = fetch_data_from_api(api_data_url)

    # 2. Build Vocabulary and get sampling data
    # This returns vocabulary mappings (text <-> index) and the sampling list (indices)
    vocabulary_artifacts = build_vocabulary_from_posts(all_posts)

    # 3. Save Vocabulary artifacts (for handler use)
    vocab_artifacts_for_save = {
           k: v for k, v in vocabulary_artifacts.items()
           if k in ["vocabulary_size", "tag_text_to_model_index", "model_index_to_tag_text"]
       }
    log.info(f"Build (prepare_data): Attempting to save vocabulary artifacts to {vocab_save_path}...") # <-- ADD THIS LOG
    try:
        # Directory is created in Dockerfile
        with open(vocab_save_path, "w") as f:
            json.dump(vocab_artifacts_for_save, f, indent=2)
        log.info(f"Build (prepare_data): Vocabulary artifacts saved successfully.") # <-- ADD THIS LOG
    except Exception as e:
        log.error(f"Build Error (prepare_data): Failed to save vocabulary artifacts: {e}")
        sys.exit(1) # Still exit build on this critical failure


    # 4. Prepare Training Data and Save to Temp File
    log.info("Build (prepare_data): Starting generation of training pairs...") # <-- ADD THIS LOG
    try: # Add a try/except around the pair generation too
        generate_training_pairs_from_posts(all_posts, vocabulary_artifacts)
        log.info("Build (prepare_data): Finished generation of training pairs.") # <-- ADD THIS LOG
    except Exception as e:
        log.error(f"Build Error (prepare_data): Failed during training pair generation: {e}")
        sys.exit(1) # Still exit build on this critical failure


    # 5. Run the Training Script (train_model.py)
    log.info("Build (prepare_data): Starting model training subprocess...") # Existing log
    # Ensure train_model.py is in the /workspace directory
    train_command = [
        "python3.11", # Use python3.11 as specified by base image
        "/workspace/train_model.py", # Path to the script inside container
        DATA_TEMP_PATH, # Temporary data file
        str(vocabulary_artifacts["vocabulary_size"]), # Pass vocabulary size
        model_save_dir, # Directory to save the model
    ]
    log.info(f"Build (prepare_data): Executing: {' '.join(train_command)}")
    try:
        # Use subprocess.run to wait for completion and capture output
        result = subprocess.run(train_command, capture_output=True, text=True, check=True)
        log.info("Build (prepare_data): train_model.py STDOUT:\n" + result.stdout)
        if result.stderr:
            log.warn("Build (prepare_data): train_model.py STDERR:\n" + result.stderr)
        log.info("Build (prepare_data): Model training subprocess finished successfully.")
    except FileNotFoundError:
        log.error(f"Build Error (prepare_data): Python executable or {train_command[1]} not found.")
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        log.error(f"Build Error (prepare_data): Model training subprocess failed with exit code {e.returncode}")
        log.error("Build (prepare_data): train_model.py STDOUT:\n" + e.stdout)
        log.error("Build (prepare_data): train_model.py STDERR:\n" + e.stderr)
        sys.exit(1)
    except Exception as e:
        log.error(f"Build Error (prepare_data): An unexpected error occurred during training subprocess: {e}")
        sys.exit(1)


    # 6. Clean up temporary data file
    log.info(f"Build (prepare_data): Cleaning up temporary data file: {DATA_TEMP_PATH}")
    try:
        os.remove(DATA_TEMP_PATH)
        log.info("Build (prepare_data): Temporary data file removed.")
    except OSError as e:
        log.warn(f"Build Warning (prepare_data): Could not remove temporary data file {DATA_TEMP_PATH}: {e}")

    log.info("Build (prepare_data): Data preparation and training complete.")
    # sys.exit(0) # Success is implicit if no exceptions or sys.exit(1) calls happen
