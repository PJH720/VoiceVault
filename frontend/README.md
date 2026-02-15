# VoiceVault Frontend

Next.js 16 + TypeScript + Tailwind CSS frontend for VoiceVault.

## Quick Start

```bash
pnpm install
cp .env.example .env.local   # configure backend URLs
pnpm dev                      # → http://localhost:3000
```

## Environment Variables

Copy `.env.example` to `.env.local` and adjust for your environment.
`.env.local` is gitignored — it never gets committed.

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000/api/v1` | REST API base URL (no trailing slash) |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | WebSocket base URL (no trailing slash) |

### How It Works

- `src/lib/env.ts` validates all required env vars at build/startup time
- Missing vars → build fails with a clear error message pointing to `.env.example`
- Trailing slashes are auto-stripped to prevent double-slash URL bugs
- `src/lib/api.ts` and WebSocket helpers import URLs from `env.ts`

### Environment Switching

| Environment | File | Example |
|-------------|------|---------|
| Local dev | `.env.local` | `http://localhost:8000/api/v1` |
| Staging | `.env.production` (or Vercel env) | `https://staging-api.voicevault.dev/api/v1` |
| Production | Vercel / Docker env vars | `https://api.voicevault.dev/api/v1` |

## Scripts

```bash
pnpm dev            # Development server
pnpm build          # Production build
pnpm start          # Start production server
pnpm lint           # ESLint
pnpm format         # Prettier
pnpm type-check     # TypeScript type checking
```
