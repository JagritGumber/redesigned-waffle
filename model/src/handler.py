# runpod_handler.py
# Script to run when the container is deployed (inference handler)

import runpod
import tensorflow as tf
import json
import os
import numpy as np
import time

# Use RunPodLogger
log = runpod.RunPodLogger()

# Paths inside the container (must match Dockerfile and prepare_data.py)
MODEL_SAVE_DIR = os.environ.get("MODEL_SAVE_DIR", "/workspace/data/tag_embedding_model")
VOCAB_SAVE_PATH = os.environ.get("VOCAB_SAVE_PATH", "/workspace/data/tag_embedding_vocab.json")

# Global variables to hold the loaded model and vocabulary artifacts
loaded_model = None
# Updated vocabulary structure:
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
        # Load the Keras model saved in SavedModel format
        loaded_model = tf.keras.models.load_model(MODEL_SAVE_DIR, compile=False)
        log.info(f"Handler: Model loaded successfully from {MODEL_SAVE_DIR}")

        # Access the embedding layer
        try:
            embedding_layer = loaded_model.get_layer('embedding')
            # Get the weights (the embedding matrix)
            embedding_matrix = embedding_layer.get_weights()[0]
            embedding_dim = embedding_matrix.shape[1]
            log.info(f"Handler: Embedding matrix loaded (shape: {embedding_matrix.shape})")
        except ValueError as e:
             log.error(f"Handler Error: Could not find embedding layer by name 'embedding' or get its weights: {e}")
             # Set globals to None to indicate failure
             loaded_model, tag_text_to_model_index, model_index_to_tag_text, embedding_matrix = None, None, None, None
             return # Loading failed

        # Load vocabulary
        with open(VOCAB_SAVE_PATH, "r") as f:
            vocab_data = json.load(f)
            vocabulary_size = vocab_data["vocabulary_size"]
            tag_text_to_model_index = vocab_data["tag_text_to_model_index"]
            # Convert keys to integers for model_index_to_tag_text
            model_index_to_tag_text = {int(k): v for k, v in vocab_data["model_index_to_tag_text"].items()}

        log.info(f"Handler: Vocabulary loaded from {VOCAB_SAVE_PATH} (size: {vocabulary_size})")

        # Basic checks
        if vocabulary_size != embedding_matrix.shape[0]:
             log.error(f"Handler Error: Vocabulary size ({vocabulary_size}) does not match embedding matrix size ({embedding_matrix.shape[0]})!")
             # Note: Embedding matrix size should be `num_frequent_tags + 1` if index 0 is padding.
             # The model input_dim should match vocabulary_size.
             # If model input_dim is num_frequent_tags+1, matrix shape is (num_frequent_tags+1, embedding_dim)
             # Check if the loaded matrix shape is consistent with the expected vocabulary size.
             if embedding_matrix.shape[0] != vocabulary_size:
                log.error(f"Handler Error: Embedding matrix size ({embedding_matrix.shape[0]}) does not match expected vocabulary size ({vocabulary_size}).")
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

def get_tag_embedding_vector(tag_name: str) -> np.ndarray | None:
    """Retrieves the embedding vector for a single tag name using its model index."""
    if embedding_matrix is None or tag_text_to_model_index is None: return None

    model_index = get_tag_model_index(tag_name)
    if model_index is None:
        # log.warn(f"Handler Warning: Tag '{tag_name}' not found in vocabulary.") # Too noisy during inference
        return None # Return None for unknown tags or tags not in vocabulary

    try:
        # Lookup the embedding vector directly from the matrix using the model index
        embedding_vector = embedding_matrix[model_index]
        return embedding_vector # Return as numpy array
    except IndexError:
        log.error(f"Handler Error: Model index {model_index} out of bounds for embedding matrix (size {embedding_matrix.shape[0]}).")
        return None
    except Exception as e:
        log.error(f"Handler Error: Failed to retrieve embedding for tag '{tag_name}' at index {model_index}: {e}")
        return None

def handler(job):
    """
    Main handler function for RunPod Serverless requests.
    job['input'] contains the request payload.
    """
    # Attempt to load artifacts if not already loaded (safe to call repeatedly)
    _load_artifacts()

    # Check if artifacts were loaded successfully
    if loaded_model is None or tag_text_to_model_index is None or model_index_to_tag_text is None or embedding_matrix is None:
        log.error("Handler Error: Artifacts could not be loaded. Cannot process request.")
        return {"status": "ERROR", "message": "Model or vocabulary failed to load on worker."}


    # Process the input request for tag completion
    # Expected input format: { "input": { "query_tags": ["tag1", "tag2"], "limit": 10 } }
    input_data = job.get('input', {})
    query_tags = input_data.get('query_tags', [])
    limit = input_data.get('limit', 10)

    if not isinstance(query_tags, list) or not query_tags:
        log.warn("Handler: Invalid input. 'query_tags' must be a non-empty list.")
        return {"status": "ERROR", "message": "Invalid input. Please provide a non-empty list of 'query_tags'."}

    # Get embeddings for the query tags
    query_embeddings = []
    valid_query_tags = []
    query_tag_model_indices = set() # Keep track of indices of query tags to exclude
    for tag_name in query_tags:
        model_index = get_tag_model_index(tag_name)
        if model_index is not None:
             emb = embedding_matrix[model_index] # Get embedding directly using index
             query_embeddings.append(emb)
             valid_query_tags.append(tag_name)
             query_tag_model_indices.add(model_index)
        # else: Tag not in vocab, ignored


    if not query_embeddings:
        log.warn(f"Handler: No valid query tags found in vocabulary from input: {query_tags}")
        return {"status": "COMPLETED", "suggestions": [], "message": "No valid query tags found in vocabulary."}

    # Calculate the average embedding for the query tags
    average_embedding = np.mean(query_embeddings, axis=0)

    # Calculate similarity between the average embedding and ALL tag embeddings
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


    # Calculate dot products
    # embedding_matrix is shape (vocab_size, embedding_dim)
    # average_embedding is shape (embedding_dim,)
    # np.dot(average_embedding, embedding_matrix.T) gives shape (vocab_size,)
    dot_products = np.dot(average_embedding, embedding_matrix.T)

    # Calculate cosine similarities
    similarities = dot_products / (average_embedding_norm * _load_artifacts.embedding_norms)


    # Get tag model indices and their similarity scores
    # We iterate through all possible model indices (1 to num_frequent_tags)
    # Index 0 is padding and should be ignored
    tag_scores = []
    # vocabulary_size is num_frequent_tags + 1
    for model_index in range(1, vocabulary_size): # Start from 1 to skip padding index 0
         tag_scores.append((model_index, similarities[model_index]))


    # Sort tags by similarity score in descending order
    tag_scores.sort(key=lambda item: item[1], reverse=True)

    # Filter out the query tag indices and get the top suggestions
    suggestions = []
    added_count = 0

    for model_index, score in tag_scores:
        # Check if the index is one of the query tags
        if model_index in query_tag_model_indices:
            continue

        tag_name = get_tag_name_from_model_index(model_index)
        # tag_name should not be None if model_index is >= 1 and < vocabulary_size
        if tag_name is not None:
             suggestions.append({"tag": tag_name, "score": float(score)}) # Convert numpy float to standard float

             added_count += 1
             if added_count >= limit:
                 break # Stop once we have enough suggestions
        # else: Should not happen with valid model_index >= 1


    log.info(f"Handler: Processed query: {valid_query_tags}, returning {len(suggestions)} suggestions.")

    # Return status COMPLETED and the suggestions
    return {"status": "COMPLETED", "suggestions": suggestions}


# Load the model and vocabulary artifacts when the script starts
_load_artifacts()

# Pre-calculate norms after loading artifacts for efficiency
if embedding_matrix is not None:
    try:
        log.info("Handler: Pre-calculating embedding norms on startup.")
        # Norms needed for all embeddings including padding if index 0 is used/loaded
        # However, padding index 0 should ideally have a zero vector or not be used in similarity
        # If model index 0 is truly padding and its embedding is all zeros, its norm is 0.
        # We should probably calculate norms for all indices loaded, but filter out 0 when computing similarity.
        # The current similarity calculation loop already excludes index 0 from the `tag_scores` list.
        # Calculating norm for index 0 is harmless but adds a tiny bit of compute.
        _load_artifacts.embedding_norms = np.linalg.norm(embedding_matrix, axis=1)
        log.info("Handler: Norms calculated on startup.")
    except Exception as e:
        log.error(f"Handler Error: Failed to pre-calculate embedding norms on startup: {e}")
        _load_artifacts.embedding_norms = None # Indicate failure


# Start the RunPod serverless worker
log.info("Handler: Starting RunPod serverless worker...")
runpod.serverless.start({"handler": handler})
