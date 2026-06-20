# Model Migrations

Model migrations are immutable JSON files used to bake downloaded models into the
generator Docker image with Docker layer caching.

Add one file per model/version/file, ordered by filename:

```json
{
  "id": "civitai-123-456",
  "url": "https://civitai.com/api/download/models/456",
  "path": "/runpod-volume/workspace/models/model-name/version/file.safetensors",
  "sha256": "optional"
}
```

Then render the Dockerfile:

```bash
python generator/scripts/render_model_dockerfile.py
```

Each migration becomes its own `RUN` instruction. When a new migration is added,
Docker can reuse cached layers for all earlier migrations and only download the
new model layer.
