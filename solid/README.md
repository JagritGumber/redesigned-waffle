# Selfhost Studio Web

`solid` is the primary frontend for Selfhost Studio.

## Development

```bash
cp .env.example .env
bun install
bun run dev
```

Default URL: `http://localhost:3000`.

Configure:

```bash
VITE_BACKEND_URL=http://localhost:8765
```

The stable backend is `../manager`. The Cloudflare Worker in `../backend` is experimental and should not be used as the primary backend for this frontend yet.
