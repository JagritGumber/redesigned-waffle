# ---------------------------------------------------------------------------- #
#                         Stage 1: Download the models                         #
# ---------------------------------------------------------------------------- #
FROM python:3.10.14-slim as download

RUN set -eux; \
    echo "[generator-build] download stage: installing wget"; \
    apt-get update; \
    apt-get install -y wget --no-install-recommends; \
    rm -rf /var/lib/apt/lists/*; \
    echo "[generator-build] download stage: wget installed"

COPY generator/scripts/download_model_layer.py /usr/local/bin/download_model_layer.py

# Model migrations are rendered as one RUN layer per model. Keep this block generated
# with: python generator/scripts/render_model_dockerfile.py
# BEGIN MODEL MIGRATION LAYERS
COPY generator/model-migrations/0000-base.json /model-migrations/0000-base.json
RUN set -eux; \
    echo "[generator-build] migration 0000-base: start"; \
    python /usr/local/bin/download_model_layer.py --manifest /model-migrations/0000-base.json; \
    echo "[generator-build] migration 0000-base: done"
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

SHELL ["/bin/bash", "-euxo", "pipefail", "-c"]

RUN echo "[generator-build] final stage: installing system packages" && \
    apt-get update && \
    apt-get install -y \
    fonts-dejavu-core rsync git jq moreutils aria2 wget libgoogle-perftools-dev libtcmalloc-minimal4 procps libgl1 libglib2.0-0 && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* && \
    apt-get clean -y && \
    echo "[generator-build] final stage: system packages installed"

RUN echo "[generator-build] final stage: cloning stable-diffusion-webui" && \
    git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git && \
    cd stable-diffusion-webui && \
    echo "[generator-build] final stage: checking out ${A1111_RELEASE}" && \
    git reset --hard ${A1111_RELEASE} && \
    echo "[generator-build] final stage: installing xformers" && \
    pip install xformers && \
    echo "[generator-build] final stage: installing A1111 requirements" && \
    pip install -r requirements_versions.txt && \
    echo "[generator-build] final stage: preparing A1111 environment" && \
    python -c "from launch import prepare_environment; prepare_environment()" --skip-torch-cuda-test && \
    echo "[generator-build] final stage: A1111 environment ready"

COPY --from=download /defaults/ /defaults/
COPY --from=download /runpod-volume/ /runpod-volume/

# install dependencies
COPY generator/requirements.txt .
RUN echo "[generator-build] final stage: installing generator requirements" && \
    pip install --no-cache-dir -r requirements.txt && \
    echo "[generator-build] final stage: generator requirements installed"

COPY generator/test_input.json .

ADD generator/src .

RUN echo "[generator-build] final stage: preparing start script" && \
    chmod +x /start.sh && \
    echo "[generator-build] final stage: image build complete"
CMD ./start.sh
