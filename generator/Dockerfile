FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    HF_HUB_ENABLE_HF_TRANSFER=1 \
    PYTHONUNBUFFERED=1 \
    UV_NO_CACHE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3.11 \
    python3.11-venv \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN ln -sf /usr/bin/python3.11 /usr/local/bin/python && \
    ln -sf /usr/bin/python3.11 /usr/local/bin/python3

RUN pip install --no-cache-dir uv

ENV PATH="/.venv/bin:${PATH}"
RUN uv venv --python 3.11 /.venv

RUN uv pip install --no-cache torch --extra-index-url https://download.pytorch.org/whl/cu121

COPY generator/requirements.txt /requirements.txt
RUN uv pip install --no-cache -r /requirements.txt && \
    find /.venv -type d -name "__pycache__" -prune -exec rm -rf {} + && \
    find /.venv -type f -name "*.pyc" -delete

COPY generator/src/download_weights.py /download_weights.py
RUN python /download_weights.py && \
    rm -rf /root/.cache/uv /root/.cache/pip /tmp/*

COPY generator/test_input.json /test_input.json
ADD generator/src /

CMD python -u /handler.py
