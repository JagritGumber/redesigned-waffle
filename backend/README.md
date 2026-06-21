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
Keep committed `wrangler.jsonc` limited to non-secret IDs, URLs, bucket names,
and feature flags. Do not put API keys, bearer tokens, OAuth secrets, or webhook
tokens in `wrangler.jsonc`.

For local development, use Wrangler's local secret file:

```sh
cp .dev.vars.example .dev.vars
```

Fill regenerated secret values in `backend/.dev.vars`. That file is ignored by
git and is loaded by `wrangler dev`.

D1 database IDs and R2 bucket names are not API secrets; they can stay in
`wrangler.jsonc` as bindings. The current Worker uses one D1 binding named `DB`
and one R2 binding named `R2`. If your deployment has a second R2 bucket, add it
as another `r2_buckets` binding in `wrangler.jsonc` with its own binding name.
Do not put access keys or bearer tokens in `wrangler.jsonc`.

For deployed Workers, use Wrangler secrets:

```sh
wrangler secret put AUTH_SECRET
wrangler secret put RUNPOD_API_KEY
wrangler secret put MODEL_IMAGE_REBUILD_GITHUB_TOKEN
wrangler secret put MODEL_IMAGE_REBUILD_WEBHOOK_TOKEN
wrangler secret put MODEL_IMAGE_WEBHOOK_TOKEN
```

Use normal Wrangler vars only for non-secret values:

```sh
MODEL_IMAGE_REBUILD_PROVIDER=github
MODEL_IMAGE_REBUILD_GITHUB_REPOSITORY=owner/repo
RUNPOD_GENERATOR_ID=runpod-serverless-endpoint-id
MODEL_IMAGE_RUNPOD_BUILD_POLLING=true
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

and these values:

```sh
RUNPOD_API_KEY is a Wrangler secret
RUNPOD_GENERATOR_ID is a normal Wrangler var
MODEL_IMAGE_RUNPOD_BUILD_POLLING is a normal Wrangler var
```

the Worker polls RunPod endpoint builds once per minute and updates model status
from Pending, Building, Uploading, Testing, Completed, Failed, Cancelled, or
Test Failed. If polling is disabled or you use a custom builder, call
`/api/v1/webhooks/model-image` to mark the model ready or failed.
