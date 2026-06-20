<h1>Automatic1111 Stable Diffusion web UI</h1>

[![RunPod](https://api.runpod.io/badge/runpod-workers/worker-a1111)](https://www.runpod.io/console/hub/runpod-workers/worker-a1111)

- Runs [Automatic1111 Stable Diffusion WebUI](https://github.com/AUTOMATIC1111/stable-diffusion-webui) and exposes its `txt2img` API endpoint
- Supports cacheable model migrations for self-hosted model installs

## Cacheable Model Migrations

Models should be baked into the generator image as immutable migrations instead
of repeatedly downloading them onto a RunPod volume.

The flow is:

1. Manager receives a model install request.
2. If `MODEL_IMAGE_REBUILD_PROVIDER=github` is configured, manager dispatches
   `.github/workflows/model-image-rebuild.yml` with `migration.id`,
   `migration.url`, and `migration.path`.
3. The workflow commits a migration and creates a GitHub release. RunPod's
   GitHub integration builds `generator/Dockerfile` on RunPod infrastructure,
   stores the image in RunPod's registry, and deploys the endpoint.

The migration rendering step is:

```bash
python generator/scripts/add_model_migration.py \
  --id "$MIGRATION_ID" \
  --url "$MIGRATION_URL" \
  --path "$MIGRATION_PATH"
python generator/scripts/render_model_dockerfile.py
```

Each migration renders as a separate Docker `RUN` layer. Older model layers stay
cached, so adding one model only downloads that new model during the image build.
The Dockerfile accepts an optional BuildKit secret named `civitai_api_token`, but
public Civitai download URLs work without it. If your RunPod GitHub builder does
not expose build secrets, keep model install URLs public or use a custom builder
hook.

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
confirm the GitHub Actions workflow still contains the cache, retry, RunPod
release trigger, manager callback pieces, and documented self-host environment
keys.
Use `bun run verify:pipeline:full` before a release to include manager/Solid
builds, Worker dry-run deploy, and whitespace checks.

After real GitHub and RunPod credentials are configured, verify external access
without printing secrets:

```bash
cd ../manager
bun run check:external-pipeline
```

To confirm `repository_dispatch` reaches the workflow without creating a
migration commit, GitHub release, Docker build, RunPod hook, or manager callback,
run the opt-in dry-run and wait for the GitHub Actions result:

```bash
cd ../manager
bun run check:external-pipeline -- --dispatch-dry-run --wait
```

RunPod GitHub integration builds and deploys when the workflow creates a
release. Track final build status in the RunPod Builds tab. Manager polls
RunPod's endpoint builds once per minute when `RUNPOD_API_KEY`,
`RUNPOD_GENERATOR_ID`, and `MODEL_IMAGE_RUNPOD_BUILD_POLLING=true` are
configured, so the app can automatically move installs through active states and
mark them ready or failed. If polling is disabled or a custom builder is used,
call manager after the build is completed or failed:

```bash
MANAGER_WEBHOOK_URL="$MANAGER_URL" \
MANAGER_WEBHOOK_TOKEN="$MODEL_IMAGE_WEBHOOK_TOKEN" \
python generator/scripts/report_model_image_status.py \
  --build-trigger-id "..." \
  --status COMPLETED \
  --image "model-release-tag"
```

Use `"status":"FAILED"` with a `message` when a RunPod build fails. A custom
builder hook can make this callback automatically; otherwise the build stays
visible as active in the Solid UI until this callback is sent.

RunPod's documented GitHub builder states are Pending, Building, Uploading,
Testing, Completed, and Failed. The manager accepts these statuses directly.
RunPod also documents a 30 minute Docker build step timeout and an 80 GB image
size limit for this integration, so model installs should be kept as small,
incremental migrations.

Required GitHub repository secrets:

- `MANAGER_WEBHOOK_URL`, public manager base URL for build status callbacks
- `MANAGER_WEBHOOK_TOKEN`, must match manager `MODEL_IMAGE_WEBHOOK_TOKEN` when configured
- `RUNPOD_BUILD_WEBHOOK_URL`, optional custom build hook if not using RunPod's GitHub release integration
- `RUNPOD_BUILD_WEBHOOK_TOKEN`, optional bearer token for the custom build hook

---

## Usage

The `input` object accepts any valid parameter for the Automatic1111 `/sdapi/v1/txt2img` endpoint. Refer to the [Automatic1111 API Documentation](https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API) for a full list of available parameters (like `seed`, `sampler_name`, `batch_size`, `styles`, `override_settings`, etc.).

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
