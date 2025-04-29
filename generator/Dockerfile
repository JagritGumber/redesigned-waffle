# ---------------------------------------------------------------------------- #
#                         Stage 1: Download the models                         #
# ---------------------------------------------------------------------------- #
FROM python:3.10.14-slim as download

RUN apk add --no-cache wget && \
    wget -q -O /model.safetensors https://civitai.com/api/download/models/1412789?token=9f61f82876b8b2efbd8764e206ff8f2b

COPY generator/download_pretrained.py .

# Make the script executable (optional but good practice)
RUN chmod +x download_pretrained.py

# Execute the download script to fetch Civitai models
# Use python -u to prevent output buffering
RUN python -u download_pretrained.py


# ---------------------------------------------------------------------------- #
#                        Stage 2: Build the final image                        #
# ---------------------------------------------------------------------------- #
FROM python:3.10.14-slim as build_final_image

ARG A1111_RELEASE=v1.9.3

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_PREFER_BINARY=1 \
    ROOT=/stable-diffusion-webui \
    PYTHONUNBUFFERED=1

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update && \
    apt install -y \
    fonts-dejavu-core rsync git jq moreutils aria2 wget libgoogle-perftools-dev libtcmalloc-minimal4 procps libgl1 libglib2.0-0 && \
    apt-get autoremove -y && rm -rf /var/lib/apt/lists/* && apt-get clean -y

RUN --mount=type=cache,target=/root/.cache/pip \
    git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git && \
    cd stable-diffusion-webui && \
    git reset --hard ${A1111_RELEASE} && \
    pip install xformers && \
    pip install -r requirements_versions.txt && \
    python -c "from launch import prepare_environment; prepare_environment()" --skip-torch-cuda-test

COPY --from=download /model.safetensors /model.safetensors
COPY --from=download /defaults/ /defaults/

# install dependencies
COPY generator/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

COPY generator/test_input.json .

ADD generator/src .

RUN chmod +x /start.sh
CMD generator/start.sh