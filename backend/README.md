# Cloudflare Worker Backend

This backend is experimental. The stable self-host stack is `../solid` with
`../manager`; keep new production work there first.

To install dependencies:

```sh
bun install
```

To run:

```sh
bun run dev
```

open http://localhost:3000

## Model Image Rebuilds

The Worker supports the same cacheable model-image install flow as `manager`.
Set these vars/secrets when using it:

```sh
MODEL_IMAGE_REBUILD_PROVIDER=github
MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY=owner/repo
MODEL_IMAGE_REBUILD_GITHUB_TOKEN=github_pat_or_app_token
MODEL_IMAGE_WEBHOOK_TOKEN=shared-callback-token
```

Model install requests dispatch `.github/workflows/model-image-rebuild.yml`.
The workflow adds one immutable file in `generator/model-migrations/` and
creates a GitHub release. RunPod's GitHub integration builds
`generator/Dockerfile` on RunPod infrastructure, reusing Docker cache layers for
previous model migrations.

The Worker includes a scheduled handler. With this Wrangler trigger:

```json
"triggers": {
  "crons": ["*/1 * * * *"]
}
```

and these variables:

```sh
RUNPOD_API_KEY=runpod-api-key
RUNPOD_GENERATOR_ID=runpod-serverless-endpoint-id
MODEL_IMAGE_RUNPOD_BUILD_POLLING=true
```

the Worker polls RunPod endpoint builds once per minute and updates model status
from Pending, Building, Uploading, Testing, Completed, Failed, Cancelled, or
Test Failed. If polling is disabled or you use a custom builder, call
`/api/v1/webhooks/model-image` to mark the model ready or failed.
