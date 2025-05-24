# Base image -> https://github.com/runpod/containers/blob/main/official-templates/base/Dockerfile
# DockerHub -> https://hub.docker.com/r/runpod/base/tags
FROM runpod/base:0.4.0-cuda11.8.0

# Set the working directory inside the container
WORKDIR /workspace

# Copy Python dependencies requirements file
COPY model/requirements.txt /requirements.txt

# Install Python dependencies using python3.11
RUN python3.11 -m pip install --upgrade pip && \
    python3.11 -m pip install --upgrade -r /requirements.txt --no-cache-dir && \
    rm /requirements.txt

# Copy required scripts for build and runtime
COPY model/src .

# --- BUILD TIME TRAINING STEP ---
# This runs *only* when the Docker image is built.
# It fetches data, prepares it, trains the model, and saves artifacts.

# Define the API URL for data fetching. Use an environment variable.
# You'll set the actual value in the RunPod template settings.
# Example default (replace this):
ENV API_DATA_URL="https://iv-frost-vote-grocery.trycloudflare.com/data/"

# Define paths for saving artifacts within the container
ENV MODEL_SAVE_DIR="/workspace/data/tag_embedding_model"
ENV VOCAB_SAVE_PATH="/workspace/data/tag_embedding_vocab.json"

# Create directory for saved artifacts
RUN mkdir -p ${MODEL_SAVE_DIR} && \
    mkdir -p $(dirname ${VOCAB_SAVE_PATH})

# Execute the data preparation and training script
# Pass the API URL and artifact save paths as arguments
# The script will call train_model.py internally
RUN python3.11 prepare_data.py ${API_DATA_URL} ${MODEL_SAVE_DIR} ${VOCAB_SAVE_PATH}

# --- END BUILD TIME TRAINING STEP ---

# Define the command to run the RunPod handler script when the container starts
# This script loads the artifacts saved during the build
CMD python3.11 -u /workspace/handler.py
