# prepare_data.py
# Script to run during RunPod build process (called by Dockerfile)

import requests
import json
import os
import sys
import subprocess
from collections import defaultdict
import random

# --- Configuration (Keep consistent with training) ---
MIN_TAG_FREQUENCY = 5 # Minimum frequency for a tag to be included in the vocabulary
POSITIVE_PAIR_WINDOW_SIZE = 0 # If > 0, only consider tags within this distance in a post. 0 means all pairs in a post.
NEGATIVE_SAMPLES_PER_POSITIVE = 2 # Number of negative samples generated for each positive pair

# Note: MODEL_SAVE_DIR and VOCAB_SAVE_PATH are passed as arguments from the Dockerfile ENV vars

# Temporary file for data transfer between prepare_data.py and train_model.py
DATA_TEMP_PATH = "/workspace/temp_training_data.json" # Temp file inside the container

# --- Data Fetching Function ---
def fetch_data_from_api(api_url: str):
    print(f"Build (prepare_data): Fetching data from API: {api_url}")
    try:
        response = requests.get(api_url)
        response.raise_for_status() # Raise an HTTPError for bad responses (4xx or 5xx)
        data = response.json()
        print(f"Build (prepare_data): Successfully fetched {len(data)} posts.")
        return data
    except requests.exceptions.RequestException as e:
        print(f"Build Error (prepare_data): Failed to fetch data from API: {e}", file=sys.stderr)
        sys.exit(1) # Exit the build process if data fetching fails
    except json.JSONDecodeError as e:
        print(f"Build Error (prepare_data): Failed to parse API response as JSON: {e}", file=sys.stderr)
        sys.exit(1)

# --- Vocabulary Building Function ---
def build_vocabulary_from_posts(posts: list) -> tuple:
    print("Build (prepare_data): Building vocabulary...")
    tag_counts = defaultdict(int)

    for post in posts:
        tags = post.get("tags", [])
        for tag in tags:
            tag_counts[tag] += 1

    # Filter tags by minimum frequency and sort by frequency
    frequent_tags = sorted(
        [tag for tag, count in tag_counts.items() if count >= MIN_TAG_FREQUENCY],
        key=lambda tag: tag_counts[tag],
        reverse=True, # Most frequent first
    )

    # Assign integer IDs (0-based)
    vocabulary = {tag: i for i, tag in enumerate(frequent_tags)}
    vocabulary_size = len(vocabulary)

    # Create reverse mapping (string keys for JSON, convert to int later)
    id_to_tag = {str(i): tag for tag, i in vocabulary.items()}

    print(f"Build (prepare_data): Vocabulary size: {vocabulary_size}")
    print(f"Build (prepare_data): Top 10 tags: {frequent_tags[:10]}")

    # Prepare sampling data (list of tag IDs weighted by frequency) - used for negative sampling
    tag_model_indices_for_sampling = []
    for tag in frequent_tags:
        tag_id = vocabulary[tag]
        count = tag_counts[tag]
        # Simple frequency weighting
        tag_model_indices_for_sampling.extend([tag_id] * count)

    print(f"Build (prepare_data): Sampling pool size: {len(tag_model_indices_for_sampling)}")

    return vocabulary, id_to_tag, tag_model_indices_for_sampling, vocabulary_size

# --- Training Data Generation Function ---
def prepare_training_data(posts: list, vocabulary: dict, tag_model_indices_for_sampling: list) -> dict | None:
    print("Build (prepare_data): Preparing training data...")
    source_model_indices = []
    context_model_indices = []
    labels = []

    all_vocab_ids = list(vocabulary.values()) # List of all valid tag IDs

    for post in posts:
        post_tags_names = post.get("tags", [])
        # Filter to only include tags present in our vocabulary and map to IDs
        post_tags_ids = [vocabulary[tag] for tag in post_tags_names if tag in vocabulary]

        if len(post_tags_ids) < 2:
            continue # Need at least 2 frequent tags for pairs

        # Generate Positive Pairs
        for i in range(len(post_tags_ids)):
            for j in range(len(post_tags_ids)):
                if i != j: # Avoid pairing a tag with itself
                    if POSITIVE_PAIR_WINDOW_SIZE == 0 or abs(i - j) <= POSITIVE_PAIR_WINDOW_SIZE:
                        source_model_indices.append(post_tags_ids[i])
                        context_model_indices.append(post_tags_ids[j])
                        labels.append(1.0) # Positive label

        # Generate Negative Pairs
        # For each tag in the post (source), sample negative context tags that are NOT in the post
        post_tags_set = set(post_tags_ids)
        possible_negative_targets = [tag_id for tag_id in all_vocab_ids if tag_id not in post_tags_set]

        if not possible_negative_targets:
            # Cannot generate negative samples if all vocab tags are in this post
            continue

        num_positive_in_post = len(post_tags_ids) * (len(post_tags_ids) - 1) # Number of positive pairs from this post (before windowing)
        num_negative_to_generate_per_post = int(num_positive_in_post * NEGATIVE_SAMPLES_PER_POSITIVE)

        if num_negative_to_generate_per_post == 0 and len(post_tags_ids) > 0:
             # Ensure at least some negative samples if post has tags
             num_negative_to_generate_per_post = NEGATIVE_SAMPLES_PER_POSITIVE * len(post_tags_ids)


        if num_negative_to_generate_per_post > 0:
             # Sample negative contexts from the list of tags NOT in the post
             sampled_neg_contexts = random.choices(
                  possible_negative_targets,
                  k=num_negative_to_generate_per_post
             )

             # Pair each sampled negative context with a random source tag from the post
             # This is a simplified approach. More complex methods exist.
             for neg_context_id in sampled_neg_contexts:
                 random_source_id = random.choice(post_tags_ids) # Associate negative with a random source from post
                 source_model_indices.append(random_source_id)
                 context_model_indices.append(neg_context_id)
                 labels.append(0.0) # Negative label


    print(f"Build (prepare_data): Generated {len(labels)} training samples ({labels.count(1.0)} positive, {labels.count(0.0)} negative).")

    # Check if we have training data
    if not source_model_indices:
        print("Build Error (prepare_data): No training data generated. Check data source, tag frequency, and post structure.", file=sys.stderr)
        sys.exit(1) # Fail the build if no data

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
        print(f"Build (prepare_data): Training data saved to temporary file: {DATA_TEMP_PATH}")
    except Exception as e:
        print(f"Build Error (prepare_data): Failed to save temporary data file: {e}", file=sys.stderr)
        sys.exit(1) # Fail the build if saving temp data fails


# --- Main Execution for Build ---
if __name__ == "__main__":
    # Expecting API_DATA_URL, MODEL_SAVE_DIR, VOCAB_SAVE_PATH as arguments
    if len(sys.argv) != 4:
        print("Usage: python prepare_data.py <api_data_url> <model_save_dir> <vocab_save_path>", file=sys.stderr)
        sys.exit(1)

    api_data_url = sys.argv[1]
    model_save_dir = sys.argv[2]
    vocab_save_path = sys.argv[3]

    # 1. Fetch Data
    all_posts = fetch_data_from_api(api_data_url)

    # 2. Build Vocabulary and get sampling data
    vocabulary, id_to_tag, tag_model_indices_for_sampling, vocabulary_size = build_vocabulary_from_posts(all_posts)

    # 3. Save Vocabulary and sampling data (for handler use)
    vocab_artifacts = {
        "vocabulary": vocabulary,
        "id_to_tag": id_to_tag,
        "vocabulary_size": vocabulary_size,
        # tag_model_indices_for_sampling is only needed during data prep, not for inference vocab
    }
    try:
        # Directory is created in Dockerfile
        with open(vocab_save_path, "w") as f:
            json.dump(vocab_artifacts, f, indent=2)
        print(f"Build (prepare_data): Vocabulary artifacts saved to {vocab_save_path}")
    except Exception as e:
        print(f"Build Error (prepare_data): Failed to save vocabulary artifacts: {e}", file=sys.stderr)
        sys.exit(1) # Fail the build if saving vocab fails


    # 4. Prepare Training Data and Save to Temp File
    prepare_training_data(all_posts, vocabulary, tag_model_indices_for_sampling)

    # 5. Run the Training Script (train_model.py)
    print("Build (prepare_data): Starting model training subprocess...")
    # Ensure train_model.py is in the /workspace directory
    train_command = [
        "python3.11", # Use python3.11 as specified by base image
        "/workspace/train_model.py", # Path to the script inside container
        DATA_TEMP_PATH,
        str(vocabulary_size),
        model_save_dir,
    ]
    print(f"Build (prepare_data): Executing: {' '.join(train_command)}")
    try:
        # Use subprocess.run to wait for completion and capture output
        # check=True raises CalledProcessError on non-zero exit
        # text=True decodes stdout/stderr
        result = subprocess.run(train_command, capture_output=True, text=True, check=True)
        print("Build (prepare_data): train_model.py STDOUT:\n", result.stdout)
        # Print stderr only if there was output, as it might be empty on success
        if result.stderr:
            print("Build (prepare_data): train_model.py STDERR:\n", result.stderr)
        print("Build (prepare_data): Model training subprocess finished successfully.")
    except FileNotFoundError:
        print(f"Build Error (prepare_data): Python executable or {train_command[1]} not found.", file=sys.stderr)
        print("Build Error (prepare_data): Ensure python3.11 is in PATH and train_model.py is at /workspace/train_model.py", file=sys.stderr)
        sys.exit(1)
    except subprocess.CalledProcessError as e:
        print(f"Build Error (prepare_data): Model training subprocess failed with exit code {e.returncode}", file=sys.stderr)
        print("Build (prepare_data): train_model.py STDOUT:\n", e.stdout, file=sys.stderr)
        print("Build (prepare_data): train_model.py STDERR:\n", e.stderr, file=sys.stderr)
        sys.exit(1) # Exit the build process on training failure
    except Exception as e:
        print(f"Build Error (prepare_data): An unexpected error occurred during training subprocess: {e}", file=sys.stderr)
        sys.exit(1)


    # 6. Clean up temporary data file
    print(f"Build (prepare_data): Cleaning up temporary data file: {DATA_TEMP_PATH}")
    try:
        os.remove(DATA_TEMP_PATH)
        print("Build (prepare_data): Temporary data file removed.")
    except OSError as e:
        print(f"Build Warning (prepare_data): Could not remove temporary data file {DATA_TEMP_PATH}: {e}", file=sys.stderr)
        # Warn but don't fail the build

    print("Build (prepare_data): Data preparation and training complete.")
    sys.exit(0) # Indicate successful build step
