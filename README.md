# laravel-docs-qa-frontend

Vue 3 frontend for [laravel-docs-qa-worker](https://github.com/Cilkotron/laravel-docs-qa-worker) — a RAG chatbot for Laravel documentation running entirely on Cloudflare.

**Live demo:** [laravel-docs-qa-frontend.pages.dev](https://laravel-docs-qa-frontend.pages.dev/)

## What it does

Provides a chat-style UI for the Laravel Docs Q&A Worker. Users type a question; the answer streams back token by token, with cited sources linking to the official Laravel documentation.

The frontend uses a **Pages Functions proxy** to inject the Worker's Bearer token server-side, so the token is never exposed to the browser.

## Architecture

```
┌──────────────────────────────────────────┐
│  Browser (Vue UI)                        │
│    fetch('/api/ask', { question })       │
└──────┬───────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  Cloudflare Pages Functions              │
│    functions/api/ask.ts                  │
│                                          │
│    Adds Authorization header from        │
│    server-side env (never reaches the    │
│    browser bundle) and forwards the      │
│    request stream to the Worker.         │
└──────┬───────────────────────────────────┘
       │ Bearer token added here
       ▼
┌──────────────────────────────────────────┐
│  Cloudflare Worker                       │
│    laravel-docs-qa-worker                │
│    RAG pipeline (Workers AI + Vectorize) │
└──────────────────────────────────────────┘
```

The full Worker architecture (Workers AI, Vectorize, D1, Durable Objects) lives in the [worker repo](https://github.com/Cilkotron/laravel-docs-qa-worker).

## Why a Pages Functions proxy?

The Worker requires Bearer authentication. The naive approach would be to store the token in a frontend env var (`VITE_WORKER_TOKEN`) and send it from the browser:

```javascript
// DON'T DO THIS — token ends up in the JS bundle, visible to anyone
fetch('https://worker.example/api/ask', {
  headers: { 'Authorization': `Bearer ${import.meta.env.VITE_WORKER_TOKEN}` }
})
```

Any Vite env var prefixed with `VITE_` is **inlined into the production bundle**. After `npm run build`, the token sits as a plain string in the JS file served to every visitor — visible in DevTools in under 30 seconds.

The Pages Functions proxy avoids this:

- Frontend calls its own origin (`/api/ask`)
- A Pages Function intercepts and forwards the request to the real Worker
- The Bearer token lives in **Pages environment variables** (server-side, encrypted)
- The browser never sees the token, the real Worker URL, or anything internal

This is the same public-private split used in production SaaS apps for API keys, third-party credentials, and internal service tokens.

## Tech stack

- **Vue 3** (Options API) + TypeScript
- **Vite 7** for the build
- **Tailwind v4** for styling (`@tailwindcss/vite` plugin, no config file)
- **Cloudflare Pages** for hosting
- **Pages Functions** for the server-side proxy

## Project structure

```
laravel-docs-qa-frontend/
├── src/
│   ├── App.vue                # Single-file component: input, streaming answer, citations
│   ├── main.ts                # Vue app entry
│   └── style.css              # Tailwind import
├── functions/
│   └── api/
│       └── ask.ts             # Pages Functions proxy: adds Bearer token, forwards stream
├── docs/
│   └── screenshot.png         # Demo screenshot
├── public/                    # Static assets
├── index.html                 # Vite entry HTML
├── vite.config.ts             # Vite + Tailwind plugin config
├── tsconfig.json
└── package.json
```

## Running locally

### Prerequisites
- Node.js 20.19+ or 22.12+
- A running Worker (see [worker repo](https://github.com/Cilkotron/laravel-docs-qa-worker) — can be local via `wrangler dev` or deployed)

### Install
```bash
npm install
```

### Configure environment
Create `.dev.vars` in the project root:

```
WORKER_URL=https://your-worker-url.workers.dev
WORKER_TOKEN=your-bearer-token
```

The `.dev.vars` file is gitignored — never commit it.

### Run with Pages Functions
The standard `npm run dev` runs Vite alone, which doesn't know about Pages Functions. To test the proxy locally:

```bash
npm run build
npx wrangler pages dev dist
```

This serves the built frontend on `http://localhost:8788` and runs the Pages Functions proxy alongside it.

### Run frontend only (for UI iteration)
If you don't need the proxy and just want to iterate on Vue/Tailwind:

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`. API calls to `/api/ask` will fail without the proxy — useful only for layout/styling work.

## Deploying to Cloudflare Pages

The repo is connected to Cloudflare Pages with auto-deploy on push to `main`.

### One-time setup
1. Cloudflare Dashboard → Workers & Pages → Create → Connect to Git
2. Select this repo
3. Build settings:
   - Framework preset: **Vue**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Environment variables (Production):
   - `WORKER_URL` — your Worker's URL (plaintext)
   - `WORKER_TOKEN` — your Worker's Bearer token (encrypted)
5. Save and deploy

### Subsequent deploys
```bash
git push origin main
```

Cloudflare automatically builds and deploys. Build status is visible in the Pages dashboard.

## UI features

- **Streaming response** — answers appear token-by-token as the LLM generates them. Parsed from Server-Sent Events.
- **Citations** — source URLs from the Worker's `X-Sources` response header rendered as numbered links, each opening the relevant section of the Laravel docs.
- **Reset** — "new question" button clears state without reloading the page.
- **Error states** — rate limit (429), missing context (404), and network errors all render a clear message.
- **Loading state** — caret blink while waiting for the first token.

## License

MIT