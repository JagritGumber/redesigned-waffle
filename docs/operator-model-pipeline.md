# Operator model pipeline

This document defines the intended self-hosted model lifecycle for operators.
It is deliberately secret-free: keep provider tokens, webhook secrets, RunPod
API keys, registry credentials, and Cloudflare credentials in local env files or
provider secret stores only.

## Lifecycle

1. A user signs in through the hosted frontend.
2. The user requests a model install.
3. The manager records a user-scoped install row and starts the downloader job.
4. Downloader callbacks update only that user's install state.
5. A completed download triggers a model image build request.
6. The build system creates a new image tag that includes the existing base
   runtime plus the newly installed model layer.
7. The manager records build status and the resulting image reference.
8. RunPod is updated to the new image once the build succeeds.
9. The frontend polls or subscribes to install/build/deploy status and shows the
   model as downloading, building, deploying, ready, or failed.

## Required status states

Use user-scoped install state for application behavior:

- `QUEUED`: install request accepted.
- `DOWNLOADING`: downloader job is active.
- `DOWNLOADED`: model files are present and image build can start.
- `BUILD_QUEUED`: image build request accepted.
- `BUILDING`: image build is active.
- `DEPLOYING`: RunPod update is active.
- `READY`: the user's model is available for generation.
- `FAILED`: the install, build, or deployment failed.
- `DELETED`: the user's install was removed.

Global model metadata must not be used as the source of truth for per-user
install availability.

## Docker cache strategy

The image build should keep slow-changing runtime dependencies in earlier layers
and add model files in deterministic later layers. A new model install should
therefore reuse the base image cache and only invalidate the model layer.

Recommended layout:

```dockerfile
FROM base-generator-runtime AS runtime

COPY models.manifest.json /opt/model-migrations/models.manifest.json
COPY models/ /opt/models/

ENV MODEL_MANIFEST=/opt/model-migrations/models.manifest.json
```

The `models.manifest.json` file acts like a migration ledger. Each build records
which model files are included, their destination paths, and the install ids that
caused the image version to exist.

## Secret handling

Never commit secrets in `wrangler.jsonc`, source files, tests, or examples.

Use these locations instead:

- Cloudflare Worker secrets: `wrangler secret put NAME`
- Local Worker development: `.dev.vars`
- Local Node/Bun services: `.env`
- CI or provider builds: provider secret store

Committed example files must use placeholders only.

## Self-host checklist

An operator needs:

- Cloudflare account for Worker, D1, and R2 if using the serverless manager.
- RunPod account for GPU execution.
- A container registry or RunPod builder target for generated images.
- Webhook URL reachable by downloader, builder, and RunPod callbacks.
- Per-user auth configured before model install routes are enabled.
- Secret values installed into the target provider secret store.
