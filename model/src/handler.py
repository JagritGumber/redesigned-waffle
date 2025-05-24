# runpod_handler.py
# Script to run when the container is deployed (inference handler)

import runpod
import tensorflow as tf
import json
import os
import numpy as np
import time # Added for get_directory_size logging
import shutil # Added for completeness if needed, though not used in handler


# Use RunPodLogger for handler logs
log = runpod.RunPodLogger()


# Paths inside the container (must match Dockerfile and prepare_data.py)
MODEL_SAVE_DIR = os.environ.get("MODEL_SAVE_DIR", "/workspace/data/tag_embedding_model")
VOCAB_SAVE_PATH = os.environ.get("VOCAB_SAVE_PATH", "/workspace/data/tag_embedding_vocab.json")

# Global variables to hold the loaded model and vocabulary artifacts
loaded_model = None
vocabulary = None # tag_name -> id
id_to_tag = None # id -> tag_name
embedding_matrix = None # The full embedding matrix (numpy array)
vocabulary_size = 0
embedding_dim = 0

def _load_artifacts():
    """
    Loads the trained model, vocabulary mappings, and embedding matrix
    once when the handler starts.
    """
    global loaded_model, vocabulary, id_to_tag, embedding_matrix, vocabulary_size, embedding_dim

    # Only load if not already loaded
    if loaded_model is not None and vocabulary is not None and embedding_matrix is not None:
        log.info("Handler: Artifacts already loaded.")
        return # Already loaded, do nothing

    log.info("Handler: Loading model and vocabulary...")
    try:
        # Load the Keras model saved in SavedModel format
        # Use compile=False if you only need inference and don't want to re-compile
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
             loaded_model, vocabulary, id_to_tag, embedding_matrix = None, None, None, None
             return # Loading failed

        # Load vocabulary
        with open(VOCAB_SAVE_PATH, "r") as f:
            vocab_data = json.load(f)
            vocabulary = vocab_data["vocabulary"]
            id_to_tag = {int(k): v for k, v in vocab_data["id_to_tag"].items()}
            vocabulary_size = vocab_data["vocabulary_size"]
        log.info(f"Handler: Vocabulary loaded from {VOCAB_SAVE_PATH} (size: {vocabulary_size})")

        # Basic checks
        if vocabulary_size != embedding_matrix.shape[0]:
             log.error(f"Handler Error: Vocabulary size ({vocabulary_size}) does not match embedding matrix size ({embedding_matrix.shape[0]})!")
             loaded_model, vocabulary, id_to_tag, embedding_matrix = None, None, None, None
             return # Loading failed

        if embedding_dim != loaded_model.get_layer('embedding').output_dim:
             log.error(f"Handler Error: Embedding dimension mismatch!")
             loaded_model, vocabulary, id_to_tag, embedding_matrix = None, None, None, None
             return # Loading failed


    except FileNotFoundError as e:
        log.error(f"Handler Error: Artifact file not found: {e}")
        log.error("Handler: Ensure prepare_data.py and train_model.py ran successfully during build and saved artifacts to the correct locations.")
        loaded_model, vocabulary, id_to_tag, embedding_matrix = None, None, None, None
        return # Loading failed
    except Exception as e:
        log.error(f"Handler Error: Failed to load artifacts: {e}")
        loaded_model, vocabulary, id_to_tag, embedding_matrix = None, None, None, None
        return # Loading failed


def get_tag_id(tag_name: str) -> int | None:
    """Looks up the integer ID for a tag name."""
    if vocabulary is None: return None
    return vocabulary.get(tag_name)

def get_tag_name(tag_id: int) -> str | None:
     """Looks up the tag name for an integer ID."""
     if id_to_tag is None: return None
     return id_to_tag.get(tag_id)

def get_tag_embedding_vector(tag_name: str) -> np.ndarray | None:
    """Retrieves the embedding vector for a single tag name."""
    if embedding_matrix is None or vocabulary is None: return None

    tag_id = get_tag_id(tag_name)
    if tag_id is None:
        # log.warn(f"Handler Warning: Tag '{tag_name}' not found in vocabulary.") # Too noisy
        return None # Return None for unknown tags

    try:
        # Lookup the embedding vector directly from the matrix
        embedding_vector = embedding_matrix[tag_id]
        return embedding_vector # Return as numpy array
    except IndexError:
        log.error(f"Handler Error: Tag ID {tag_id} out of bounds for embedding matrix.")
        return None
    except Exception as e:
        log.error(f"Handler Error: Failed to retrieve embedding for tag '{tag_name}': {e}")
        return None

def handler(job):
    """
    Main handler function for RunPod Serverless requests.
    job['input'] contains the request payload.
    """
    # Attempt to load artifacts if not already loaded (safe to call repeatedly)
    _load_artifacts()

    # Check if artifacts were loaded successfully
    if loaded_model is None or vocabulary is None or embedding_matrix is None:
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
    for tag_name in query_tags:
        emb = get_tag_embedding_vector(tag_name)
        if emb is not None:
            query_embeddings.append(emb)
            valid_query_tags.append(tag_name)
        # else: Tag not in vocab, warning logged by get_tag_embedding_vector or just skipped

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
    if average_embedding_norm == 0 or (_load_artifacts.embedding_norms == 0).any(): # Check if any tag norm is zero
         log.error("Handler Error: Zero norm detected, cannot compute cosine similarity.")
         return {"status": "ERROR", "message": "Internal error: Zero norm in embeddings."}


    # Calculate dot products
    dot_products = np.dot(average_embedding, embedding_matrix.T)

    # Calculate cosine similarities
    similarities = dot_products / (average_embedding_norm * _load_artifacts.embedding_norms)


    # Get tag IDs and their similarity scores
    # Using a list comprehension is efficient
    tag_scores = [(tag_id, similarities[tag_id]) for tag_id in range(vocabulary_size)]

    # Sort tags by similarity score in descending order
    tag_scores.sort(key=lambda item: item[1], reverse=True)

    # Filter out the query tags and get the top suggestions
    suggestions = []
    added_count = 0
    query_tag_ids = {get_tag_id(tag) for tag in valid_query_tags if get_tag_id(tag) is not None}


    for tag_id, score in tag_scores:
        tag_name = get_tag_name(tag_id)
        # Skip if it's one of the query tags OR tag_name is None (shouldn't happen if vocab matches matrix)
        if tag_id in query_tag_ids or tag_name is None:
            continue

        suggestions.append({"tag": tag_name, "score": float(score)}) # Convert numpy float to standard float

        added_count += 1
        if added_count >= limit:
            break # Stop once we have enough suggestions

    log.info(f"Handler: Processed query: {valid_query_tags}, returning {len(suggestions)} suggestions.")

    # Return status COMPLETED and the suggestions
    return {"status": "COMPLETED", "suggestions": suggestions}


# Load the model and vocabulary artifacts when the script starts
# This happens once when the worker container initializes
_load_artifacts()

# Pre-calculate norms after loading artifacts for efficiency
if embedding_matrix is not None:
    try:
        log.info("Handler: Pre-calculating embedding norms on startup.")
        _load_artifacts.embedding_norms = np.linalg.norm(embedding_matrix, axis=1)
        log.info("Handler: Norms calculated on startup.")
    except Exception as e:
        log.error(f"Handler Error: Failed to pre-calculate embedding norms on startup: {e}")
        _load_artifacts.embedding_norms = None # Indicate failure


# Start the RunPod serverless worker
log.info("Handler: Starting RunPod serverless worker...")
runpod.serverless.start({"handler": handler})
