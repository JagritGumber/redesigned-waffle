# runpod_handler.py
# Script to run when the container is deployed (inference handler)
# Simplified to generate a comma-separated prompt string

import runpod
import tensorflow as tf
import json
import os
import numpy as np
import time
import random # Added for potential shuffling or ordering if needed

# Use RunPodLogger
log = runpod.RunPodLogger()

# Paths inside the container (must match Dockerfile and prepare_data.py)
MODEL_SAVE_DIR = os.environ.get("MODEL_SAVE_DIR", "/workspace/data/tag_embedding_model")
VOCAB_SAVE_PATH = os.environ.get("VOCAB_SAVE_PATH", "/workspace/data/tag_embedding_vocab.json")
# Define the full path to the .keras file
MODEL_SAVE_FILE = os.path.join(MODEL_SAVE_DIR, 'model.keras')

# Global variables to hold the loaded model and vocabulary artifacts
loaded_model = None
tag_text_to_model_index = None # tag_name -> model_index (int)
model_index_to_tag_text = None # model_index (int) -> tag_name
embedding_matrix = None # The full embedding matrix (numpy array)
vocabulary_size = 0 # Total size including padding (usually max model_index + 1)
embedding_dim = 0


def _load_artifacts():
    """
    Loads the trained model, vocabulary mappings, and embedding matrix
    once when the handler starts.
    """
    global loaded_model, tag_text_to_model_index, model_index_to_tag_text, \
           embedding_matrix, vocabulary_size, embedding_dim

    # Only load if not already loaded
    if loaded_model is not None and tag_text_to_model_index is not None and \
       model_index_to_tag_text is not None and embedding_matrix is not None:
        log.info("Handler: Artifacts already loaded.")
        return # Already loaded, do nothing

    log.info("Handler: Loading model and vocabulary...")
    try:
        # Load the Keras model from the .keras file
        log.info(f"Handler: Attempting to load model from {MODEL_SAVE_FILE}")
        loaded_model = tf.keras.models.load_model(MODEL_SAVE_FILE, compile=False)
        log.info(f"Handler: Model loaded successfully from {MODEL_SAVE_FILE}")

        # Access the embedding layer
        try:
            embedding_layer = loaded_model.get_layer('embedding')
            embedding_matrix = embedding_layer.get_weights()[0]
            embedding_dim = embedding_matrix.shape[1]
            log.info(f"Handler: Embedding matrix loaded (shape: {embedding_matrix.shape})")
        except ValueError as e:
             log.error(f"Handler Error: Could not find embedding layer by name 'embedding' or get its weights: {e}")
             loaded_model, tag_text_to_model_index, model_index_to_tag_text, embedding_matrix = None, None, None, None
             return # Loading failed

        # Load vocabulary
        log.info(f"Handler: Attempting to load vocabulary from {VOCAB_SAVE_PATH}")
        with open(VOCAB_SAVE_PATH, "r") as f:
            vocab_data = json.load(f)
            vocabulary_size = vocab_data["vocabulary_size"]
            tag_text_to_model_index = vocab_data["tag_text_to_model_index"]
            model_index_to_tag_text = {int(k): v for k, v in vocab_data["model_index_to_tag_text"].items()}

        log.info(f"Handler: Vocabulary loaded from {VOCAB_SAVE_PATH} (size: {vocabulary_size})")

        # Basic checks
        if vocabulary_size != embedding_matrix.shape[0]:
             log.error(f"Handler Error: Vocabulary size ({vocabulary_size}) does not match embedding matrix size ({embedding_matrix.shape[0]})!")
             loaded_model, tag_text_to_model_index, model_index_to_tag_text, embedding_matrix = None, None, None, None
             return # Loading failed

        if embedding_dim != loaded_model.get_layer('embedding').output_dim:
             log.error(f"Handler Error: Embedding dimension mismatch!")
             loaded_model, tag_text_to_model_index, model_index_to_tag_text, embedding_matrix = None, None, None, None
             return # Loading failed


    except FileNotFoundError as e:
        log.error(f"Handler Error: Artifact file not found: {e}")
        log.error("Handler: Ensure prepare_data.py and train_model.py ran successfully during build and saved artifacts to the correct locations.")
        loaded_model, tag_text_to_model_index, model_index_to_tag_text, embedding_matrix = None, None, None, None
        return # Loading failed
    except Exception as e:
        log.error(f"Handler Error: Failed to load artifacts: {e}")
        loaded_model, tag_text_to_model_index, model_index_to_tag_text, embedding_matrix = None, None, None, None
        return # Loading failed


def get_tag_model_index(tag_name: str) -> int | None:
    """Looks up the model index for a tag name."""
    if tag_text_to_model_index is None: return None
    # Returns the model index (1-based) or None if tag not in vocabulary
    return tag_text_to_model_index.get(tag_name)

def get_tag_name_from_model_index(model_index: int) -> str | None:
     """Looks up the tag name for a model index."""
     if model_index_to_tag_text is None: return None
     # Returns the tag text or None if index is 0 (padding) or out of bounds
     return model_index_to_tag_text.get(model_index)


def handler(job):
    """
    Main handler function for RunPod Serverless requests.
    job['input'] contains the request payload:
    { "input": { "query_tags": ["tag1", "tag2"], "limit": 10 } }
    """
    _load_artifacts() # Attempt to load artifacts

    if loaded_model is None or tag_text_to_model_index is None or model_index_to_tag_text is None or embedding_matrix is None:
        log.error("Handler Error: Artifacts could not be loaded. Cannot process request.")
        return {"status": "ERROR", "message": "Model or vocabulary failed to load on worker."}


    # Process the input request
    input_data = job.get('input', {})
    query_tags = input_data.get('query_tags', [])
    limit = input_data.get('limit', 10) # Limit on *suggested* tags to add

    if not isinstance(query_tags, list) or not query_tags:
        log.warn("Handler: Invalid input. 'query_tags' must be a non-empty list.")
        return {"status": "ERROR", "message": "Invalid input. Please provide a non-empty list of 'query_tags'."}

    # 1. Process input tags, get valid embeddings and their model indices
    query_embeddings = []
    valid_query_tags = [] # Keep track of input tags found in vocabulary
    query_tag_model_indices = set() # Keep track of indices of query tags to exclude

    for tag_name in query_tags:
        # Normalize tag name if necessary (depends on your training data's tag format)
        # Assuming tag names from API are already clean / lowercase / spaced as in train_model.py
        model_index = get_tag_model_index(tag_name)
        if model_index is not None:
             # Get embedding directly using index
             # Ensure index is valid for the matrix shape
             if 0 <= model_index < embedding_matrix.shape[0]:
                  emb = embedding_matrix[model_index]
                  query_embeddings.append(emb)
                  # Add the *original* tag name from input to the list for the final prompt
                  valid_query_tags.append(tag_name)
                  query_tag_model_indices.add(model_index)
             else:
                  log.warn(f"Handler Warning: Query tag '{tag_name}' model index {model_index} out of bounds for embedding matrix.")

        # else: Tag not in vocab, ignored


    if not query_embeddings:
        log.warn(f"Handler: No valid query tags found in vocabulary from input: {query_tags}")
        # If no valid input tags, return an empty string prompt
        return {"status": "COMPLETED", "generated_prompt": "", "suggestions_details": []}


    # 2. Calculate the average embedding for the valid query tags
    average_embedding = np.mean(query_embeddings, axis=0)

    # 3. Calculate cosine similarity between the average embedding and ALL tag embeddings
    # Use cosine similarity
    # Check if norms are pre-calculated, calculate if not (should happen once)
    if not hasattr(_load_artifacts, 'embedding_norms') or _load_artifacts.embedding_norms is None:
         log.info("Handler: Pre-calculating embedding norms (fallback).")
         try:
             _load_artifacts.embedding_norms = np.linalg.norm(embedding_matrix, axis=1)
             log.info("Handler: Norms calculated.")
         except Exception as e:
             log.error(f"Handler Error: Failed to calculate embedding norms: {e}")
             return {"status": "ERROR", "message": "Internal error calculating norms."}


    # Calculate query norm
    average_embedding_norm = np.linalg.norm(average_embedding)

    # Avoid division by zero
    if average_embedding_norm == 0 or (_load_artifacts.embedding_norms == 0).any():
         log.error("Handler Error: Zero norm detected in embeddings, cannot compute cosine similarity.")
         return {"status": "ERROR", "message": "Internal error: Zero norm in embeddings."}

    dot_products = np.dot(average_embedding, embedding_matrix.T)
    similarities = dot_products / (average_embedding_norm * _load_artifacts.embedding_norms)


    # 4. Get tag model indices and their similarity scores for suggestion candidates
    # Iterate through all possible frequent tag model indices (1 to num_frequent_tags)
    # Index 0 is padding and should be ignored for suggestions
    suggestion_candidates = []
    # vocabulary_size is num_frequent_tags + 1
    # Iterate from 1 up to vocabulary_size (exclusive)
    for model_index in range(1, vocabulary_size): # Start from 1 to skip padding index 0
         # Ensure model_index is within bounds of similarities array
         if 0 <= model_index < len(similarities):
              suggestion_candidates.append((model_index, similarities[model_index]))
         else:
              log.warn(f"Handler Warning: Model index {model_index} out of bounds for similarity scores array (size {len(similarities)}).")


    # Sort candidates by similarity score (descending)
    suggestion_candidates.sort(key=lambda item: item[1], reverse=True)

    # 5. Filter out the query tag indices and get the top 'limit' suggestions
    suggested_tags_list = [] # List of suggested tag names
    suggestions_details = [] # To return details (tag, score) if needed
    added_count = 0

    for model_index, score in suggestion_candidates:
        # Check if the index is one of the query tags
        if model_index in query_tag_model_indices:
            continue

        tag_name = get_tag_name_from_model_index(model_index)
        # tag_name should not be None if model_index is >= 1 and < vocabulary_size
        if tag_name is not None:
             suggested_tags_list.append(tag_name)
             suggestions_details.append({"tag": tag_name, "score": float(score)}) # Convert numpy float to standard float

             added_count += 1
             if added_count >= limit:
                 break # Stop once we have enough suggestions

    log.info(f"Handler: Processed query: {valid_query_tags}, found {len(suggested_tags_list)} suggestions.")

    # 6. Construct the final prompt string
    # Combine valid input tags and the selected suggested tags
    # Order them as desired (e.g., valid inputs first, then suggestions)
    all_tags_for_prompt = valid_query_tags + suggested_tags_list

    # Format into a comma-separated string
    generated_prompt = ", ".join(all_tags_for_prompt)

    log.info(f"Handler: Generated prompt string: {generated_prompt}")

    # 7. Return the prompt string
    return {
        "status": "COMPLETED",
        "generated_prompt": generated_prompt,
        # You can still include suggestions_details if you want the scores
        # "suggestions_details": suggestions_details
    }


# Load the model and vocabulary artifacts when the script starts
_load_artifacts()

# Pre-calculate norms after loading artifacts for efficiency
if embedding_matrix is not None:
    try:
        log.info("Handler: Pre-calculating embedding norms on startup.")
        _load_artifacts.embedding_norms = np.linalg.norm(embedding_matrix, axis=1)
        log.info("Handler: Norms calculated on startup.")
    except Exception as e:
        log.error(f"Handler Error: Failed to pre-calculate embedding norms on startup: {e}")
        _load_artifacts.embedding_norms = None


# Start the RunPod serverless worker
log.info("Handler: Starting RunPod serverless worker...")
runpod.serverless.start({"handler": handler})
