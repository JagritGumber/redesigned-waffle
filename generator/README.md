<h1>Automatic1111 Stable Diffusion web UI</h1>

[![RunPod](https://api.runpod.io/badge/runpod-workers/worker-a1111)](https://www.runpod.io/console/hub/runpod-workers/worker-a1111)

- Runs [Automatic1111 Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) and exposes its `txt2img` API endpoint
- Supports cacheable model migrations for self-hosted model installs

## Cacheable Model Migrations

Models should be baked into the generator image as immutable migrations instead
of repeatedly downloading them onto a RunPod volume.

The flow is:

1. Manager receives a model install request.
2. With `MODEL_IMAGE_REBUILD_PROVIDER=mirror`, manager dispatches
   `model-migration.yml` in the private `<repo>-deploy` mirror with
   `migration.id`, `migration.url`, and `migration.path`.
3. The private mirror workflow renders `generator/Dockerfile`, commits the
   migration, and pushes the private branch that RunPod watches. RunPod builds
   on its own infrastructure, stores the image in RunPod's registry, and deploys
   the endpoint.

This repo only supports private-mirror model builds. Keep generated model
migrations in the private deploy mirror, not in public branches or tags.

The migration rendering step is:

```bash
python generator/scripts/add_model_migration.py \
  --id "$MIGRATION_ID" \
  --url "$MIGRATION_URL" \
  --path "$MIGRATION_PATH"
python generator/scripts/render_model_dockerfile.py
```

Each migration renders as its own Docker `COPY` plus `RUN` layer pair. Older
model layers stay cached, so adding one model only downloads that new model
during the image build. The Dockerfile accepts an optional BuildKit secret named
`civitai_api_token`, but public Civitai download URLs work without it. Use a
private deploy mirror when model URLs or model identities should not appear in
public Git history or releases.

Before relying on the workflow, run the local verifier:

```bash
bun run verify:pipeline
```

Before pointing real model installs at the workflow, check manager environment
readiness without printing secrets:

```bash
cd manager
bun run check:readiness
```

These checks create a temporary migration, render the Dockerfile, check that
model layers use BuildKit secrets, verify idempotence, reject unsafe paths, and
confirm the documented self-host environment keys.
Use `bun run verify:pipeline:full` before a release to include manager/Solid
builds, Worker dry-run deploy, and whitespace checks.

RunPod builds and deploys from the private mirror push. Track final build status
in the RunPod Builds tab. Manager polls
RunPod's endpoint builds once per minute when `RUNPOD_API_KEY`,
`RUNPOD_GENERATOR_ID`, and `MODEL_IMAGE_RUNPOD_BUILD_POLLING=true` are
configured, so the app can automatically move installs through active states and
mark them ready or failed. If polling is disabled, call manager at
`/api/v1/webhooks/model-image` after the build is completed or failed:

```bash
MANAGER_WEBHOOK_URL="$MANAGER_URL" \
MANAGER_WEBHOOK_TOKEN="$MODEL_IMAGE_WEBHOOK_TOKEN" \
python generator/scripts/report_model_image_status.py \
  --build-trigger-id "..." \
  --status COMPLETED \
  --image "model-release-tag"
```

Use `"status":"FAILED"` with a `message` when a RunPod build fails. Otherwise
the build stays visible as active in the Solid UI until this callback is sent.

RunPod builder states include Pending, Building, Uploading, Testing, Completed,
and Failed. The manager accepts these statuses directly. RunPod documents a
30 minute Docker build step timeout and an 80 GB image size limit, so model
installs should be kept as small, incremental migrations.

---

## Usage

The `input` object accepts any valid parameter for the Automatic1111 `/sdapi/v1/txt2img` endpoint. Refer to the [Automatic1111 API Documentation](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API) for a full list of available parameters (like `seed`, `sampler_name`, `batch_size`, `styles`, `override_settings`, etc.).
The worker also accepts `job_type: "generate_prompt"` and returns a deterministic
safe-for-work prompt expansion as `generated_prompt`, so self-host installs do
not require a separate LLM service for the Solid prompt helper.

### Example Request

Here's an example payload to generate an image:

```json
{
  "input": {
    "prompt": "a photograph of an astronaut riding a horse",
    "negative_prompt": "text, watermark, blurry, low quality",
    "steps": 25,
    "cfg_scale": 7,
    "width": 512,
    "height": 512,
    "sampler_name": "DPM++ 2M Karras"
  }
}
```
