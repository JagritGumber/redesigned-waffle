# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------- #
#                         Stage 1: Download the models                         #
# ---------------------------------------------------------------------------- #
FROM python:3.10.14-slim as download

RUN apt-get update && apt-get install -y wget --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY generator/scripts/download_model_layer.py /usr/local/bin/download_model_layer.py
COPY generator/model-migrations/ /model-migrations/

# Model migrations are rendered as one RUN layer per model. Keep this block generated
# with: python generator/scripts/render_model_dockerfile.py
# BEGIN MODEL MIGRATION LAYERS
RUN --mount=type=secret,id=civitai_api_token python /usr/local/bin/download_model_layer.py --manifest /model-migrations/0000-base.json
# END MODEL MIGRATION LAYERS


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

COPY --from=download /defaults/ /defaults/
COPY --from=download /runpod-volume/ /runpod-volume/

# install dependencies
COPY generator/requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir -r requirements.txt

COPY generator/test_input.json .

ADD generator/src .

RUN chmod +x /start.sh
CMD ./start.sh
