# Selfhost Studio Manager

`manager` is the stable backend for the Solid frontend.

It provides:

- local account registration/login
- model registration and safe model filtering
- RunPod generation job dispatch
- RunPod webhook handling
- generated image gallery APIs
- post template and image metadata APIs
- S3-compatible image storage access

## Development

```bash
cp .env.example .env.development.local
bun install
bun run dev
```

Default URL: `http://localhost:8765`.

## Required Environment

See `.env.example`. At minimum configure:

- `HOST_URL`
- `FRONTEND_URL`
- `RUNPOD_API_KEY`
- `RUNPOD_GENERATOR_ID`
- `RUNPOD_WEBHOOK_URL`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BUCKET_URL`
- `R2_BUCKET_NAME`

## Database

The backend uses local SQLite at `manager/db.sqlite`. Run migrations against a new database before hosting:

```bash
bunx drizzle-kit migrate
```

Do not commit `db.sqlite` or database backups.
