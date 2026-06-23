# Selfhost Studio

Selfhost Studio is a safe-for-work, self-hostable image generation studio with a Solid web app, a Bun/Elysia backend, RunPod generation workers, model management, and gallery/posting tools.

## Stable Self-Host Stack

Use these parts for the stable main branch:

- `solid`: primary web frontend.
- `manager`: primary backend API used by `solid`.
- `generator`: RunPod image generation worker.

The `backend` Cloudflare Worker is experimental and not the stable backend for
the Solid app yet. It includes the same model-image webhook plus a scheduled
RunPod build poller for Cloudflare Cron Triggers. The `downloader` worker is
optional; current self-host installs can run with generator-only workflows.
For the serverless Worker path, `backend` also provides a Self-host Worker readiness
check with `bun run check:readiness` that validates required
environment values, D1/R2 bindings, and the Cron trigger without printing
secrets.

## Quick Start

Prerequisites:

- Bun 1.2 or newer
- A RunPod serverless generator endpoint
- S3-compatible object storage, such as Cloudflare R2

1. Configure the backend:

```bash
cd manager
cp .env.example .env.development.local
```

Fill in `RUNPOD_API_KEY`, `RUNPOD_GENERATOR_ID`, `RUNPOD_WEBHOOK_URL`, and the `R2_*` values. For local development, keep:

```bash
HOST_URL=http://localhost:8765
FRONTEND_URL=http://localhost:3000
RUNPOD_WEBHOOK_URL=http://localhost:8765/api/v1/webhooks/runpod
```

Keep real values only in ignored local env files or provider secret stores. For
the stable manager backend, local secrets belong in
`manager/.env.development.local`; `manager/.env.example` only documents variable
names. For the experimental Worker backend, local secrets belong in
`backend/.dev.vars`; deployed Worker secrets must be set with
`wrangler secret put`.

Do not commit RunPod API keys, R2/S3 access keys, OAuth secrets, auth secrets,
GitHub tokens, or webhook bearer tokens. Non-secret resource identifiers can be
committed when needed: D1 database IDs, R2 bucket names, public bucket URLs,
RunPod endpoint IDs, repository names, and feature flags.

If RunPod needs to reach your local machine, set `HOST_URL` and `RUNPOD_WEBHOOK_URL` to your tunnel URL.
The public callback base is healthy when `GET <HOST_URL>/api/v1/health`
returns `{"status":"ok"}`.

Check the manager configuration without printing secrets:

```bash
cd manager
bun run check:readiness
```

2. Start the backend:

```bash
cd manager
bun install
bun run dev
```

The backend listens on `http://localhost:8765` by default and creates `db.sqlite` locally.

3. Configure the Solid frontend:

```bash
cd solid
cp .env.example .env
```

Use:

```bash
VITE_BACKEND_URL=http://localhost:8765
```

4. Start the Solid app:

```bash
cd solid
bun install
bun run dev
```

Open `http://localhost:3000`.

## Accounts

The stable backend includes local account sessions:

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

Generated jobs, prompt jobs, image metadata, post templates, and installed model libraries are account-scoped. Civitai metadata is stored once and linked to each account through per-user model install records.

## Safety Defaults

Marketplace browsing requests safe model listings by default. Backend model APIs reject restricted model downloads, and generated prompt/post metadata is constrained to safe-for-work image studio use cases.

## Cacheable Model Installs

For production, set `MODEL_IMAGE_REBUILD_PROVIDER=mirror` in `manager` with
`MODEL_IMAGE_REBUILD_MIRROR_TOKEN`. Model install requests dispatch the fixed
`model-migration.yml` workflow in the private `<repo>-deploy` mirror. That
workflow adds a migration file, renders `generator/Dockerfile`, commits the
change, and pushes the mirror branch that RunPod watches. The public repo stays
free of model names, URLs, and migration history.

This repo only supports private-mirror model builds. Keep generated model
migrations in the private deploy mirror, not in public branches or tags.

The generator image uses `generator/model-migrations/*.json`; each migration is
rendered as its own `COPY` plus `RUN` Docker layer pair so Docker cache reuses
all previous model downloads and only downloads the newly added model. Configure the RunPod
Serverless endpoint from the private deploy mirror with `generator/Dockerfile`
as the Dockerfile path. RunPod builds after the mirror workflow push; final
build/deploy status is visible in RunPod's
Builds tab. Manager also polls RunPod's endpoint builds once per minute when
`RUNPOD_API_KEY`, `RUNPOD_GENERATOR_ID`, and
`MODEL_IMAGE_RUNPOD_BUILD_POLLING=true` are configured, so normal RunPod
builds move through Pending, Building, Uploading, Testing, Completed, and
Failed without a manual callback.

If you disable polling, post the final status to manager at
`/api/v1/webhooks/model-image`. The Solid UI polls this install status while it
is active:

```bash
MANAGER_WEBHOOK_URL="$MANAGER_URL" \
MANAGER_WEBHOOK_TOKEN="$MODEL_IMAGE_WEBHOOK_TOKEN" \
python generator/scripts/report_model_image_status.py \
  --build-trigger-id "..." \
  --status COMPLETED \
  --image "model-release-tag"
```

Use `"status":"FAILED"` with a `message` when a RunPod build fails.
RunPod documents the GitHub builder statuses as Pending, Building, Uploading,
Testing, Completed, and Failed. It also documents a 30 minute Docker build step
timeout and an 80 GB image size limit, so split very large model installs into
small migrations and keep the generator image under that cap.

Before enabling this in production, run:

```bash
bun run verify:pipeline:full
```

## Open Source

Selfhost Studio is licensed under the MIT License. Do not commit real `.env`,
`.dev.vars`, database, log, R2, RunPod, GitHub token, or Cloudflare credential
files.
