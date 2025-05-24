# train_model.py
# (Modified version for Keras SavedModel format)

import tensorflow as tf
import numpy as np
import sys
import json

# Configuration (consistent with prepare_data.py)
EMBEDDING_DIM = 128 # Must match prepare_data.py and desired model size
EPOCHS = 20
BATCH_SIZE = 1024
LEARNING_RATE = 0.001

def build_model(vocabulary_size: int, embedding_dim: int) -> tf.keras.Model:
    print("Python (train_model): Building model...")

    source_input = tf.keras.Input(shape=(1,), dtype="int32", name="source_input")
    context_input = tf.keras.Input(shape=(1,), dtype="int32", name="context_input")

    embedding_layer = tf.keras.layers.Embedding(
        input_dim=vocabulary_size,
        output_dim=embedding_dim,
        input_length=1,
        name="embedding", # MUST keep this name to access it in handler
        # mask_zero=True # Uncomment if using padding ID 0 and padding your input
    )

    source_embedding = embedding_layer(source_input)
    context_embedding = embedding_layer(context_input)

    source_embedding_flat = tf.keras.layers.Reshape((embedding_dim,))(source_embedding)
    context_embedding_flat = tf.keras.layers.Reshape((embedding_dim,))(context_embedding)

    dot_product = tf.keras.layers.Dot(axes=1)([source_embedding_flat, context_embedding_flat])

    # Use a simpler output layer name if preferred, but 'output' is fine
    output = tf.keras.layers.Dense(units=1, activation="sigmoid", name="output_sigmoid")(dot_product)

    model = tf.keras.Model(inputs=[source_input, context_input], outputs=output)

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )

    model.summary()

    return model

def main(data_path: str, vocab_size: int, model_save_path: str):
    print(f"Python (train_model): Starting training with data from {data_path}")
    print(f"Python (train_model): Expected vocabulary size: {vocab_size}")

    # 1. Load Data
    try:
        with open(data_path, 'r') as f:
            data = json.load(f)
        source_ids = np.array(data['sourceModelIndices'], dtype=np.int32)
        context_ids = np.array(data['contextModelIndices'], dtype=np.int32)
        labels = np.array(data['labels'], dtype=np.float32)
        print(f"Python (train_model): Loaded {len(labels)} samples.")
    except Exception as e:
        print(f"Python Error (train_model): Failed to load data from {data_path} - {e}", file=sys.stderr)
        sys.exit(1)

    if len(labels) == 0:
        print("Python Error (train_model): No training data loaded.", file=sys.stderr)
        sys.exit(1)

    # 2. Build Model
    model = build_model(vocab_size, EMBEDDING_DIM)

    # 3. Train Model
    print("Python (train_model): Training model...")
    try:
        # Keras fit will automatically use GPU if TensorFlow is built with GPU support
        # The runpod/base:*-gpu image should have this pre-configured
        history = model.fit(
            [source_ids, context_ids],
            labels,
            epochs=EPOCHS,
            batch_size=BATCH_SIZE,
            shuffle=True,
            validation_split=0.1,
            verbose=2 # Print progress per epoch
        )
        print("Python (train_model): Training complete.")
    except Exception as e:
        # Add more specific error handling if needed (e.g., OOM errors)
        print(f"Python Error (train_model): Training failed - {e}", file=sys.stderr)
        # Check if it's an OOM error
        if "OOM" in str(e) or "Ran out of memory" in str(e):
             print("Python Error (train_model): Out of Memory during training.", file=sys.stderr)
             print("Python Error (train_model): Consider reducing BATCH_SIZE or using a GPU with more VRAM.", file=sys.stderr)
        sys.exit(1)


    # 4. Save Model
    print(f"Python (train_model): Saving model to {model_save_path}...")
    try:
        # Ensure the directory exists (should be created by prepare_data.py)
        # os.makedirs(model_save_path, exist_ok=True) # Already done by caller
        # Save in the TensorFlow SavedModel format, loadable by tf.keras.models.load_model
        model.save(model_save_path, save_format='tf')
        print("Python (train_model): Model saved successfully.")
    except Exception as e:
        print(f"Python Error (train_model): Failed to save model to {model_save_path} - {e}", file=sys.stderr)
        sys.exit(1)

    print("Python (train_model): Script finished.")
    sys.exit(0)

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python train_model.py <data_json_path> <vocabulary_size> <model_save_directory>", file=sys.stderr)
        sys.exit(1)

    data_json_path = sys.argv[1]
    try:
        vocabulary_size = int(sys.argv[2])
    except ValueError:
        print("Error: Vocabulary size must be an integer.", file=sys.stderr)
        sys.exit(1)
    model_save_directory = sys.argv[3]

    main(data_json_path, vocabulary_size, model_save_directory)
