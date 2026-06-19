# Selfhost Studio

Selfhost Studio is a safe-for-work, self-hostable image generation studio with a Solid web app, a Bun/Elysia backend, RunPod generation workers, model management, and gallery/posting tools.

## Stable Self-Host Stack

Use these parts for the stable main branch:

- `solid`: primary web frontend.
- `manager`: primary backend API used by `solid`.
- `generator`: RunPod image generation worker.

The `backend` Cloudflare Worker is experimental and not the stable backend for the Solid app yet. The `downloader` worker is optional; current self-host installs can run with generator-only workflows.

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

If RunPod needs to reach your local machine, set `HOST_URL` and `RUNPOD_WEBHOOK_URL` to your tunnel URL.

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

## Open Source

Selfhost Studio is licensed under the MIT License. Do not commit real `.env`, database, log, R2, RunPod, or Cloudflare credential files.
