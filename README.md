# Limelight

**Open-source AI-visibility auditor.** See how ChatGPT, Claude, Gemini & Perplexity describe
you, find what earns citations, and generate the structured content (FAQ / JSON-LD) that gets
you mentioned.

Limelight is the consumer take on "answer-engine optimization" (AEO/GEO): point it at a person,
solo business, or single product, run a curated prompt set through **search-enabled** answer
engines, and see — on truthful, cited data — when AI mentions you, who gets cited instead, and
where you're absent.

> Phase 1 is a standalone, MIT-licensed web app. No MCP, no SKILL.md, no external integrations —
> all core logic lives behind a clean `lib/core/*` service layer (see [ARCHITECTURE.md](ARCHITECTURE.md)).

## Status

Built milestone by milestone; each is genuinely runnable before the next starts.

| Milestone | Scope | State |
|---|---|---|
| **M1 — Scaffold** | Stack, Postgres + pgvector, Auth.js, design system, app shell, eval/CI skeleton | ✅ |
| **M2 — Subject & prompts** | Subject profile + `generatePromptSet` + onboarding + settings + switcher | ✅ |
| **M3 — Audit (single engine)** | Perplexity adapter, detect / extract / score, Inngest job, `/app` + `/app/visibility` | ✅ |
| **M4 — Multi-engine + sources** | OpenAI / Gemini / Claude adapters, `analyzeSources` + `/app/sources`, BYO encrypted keys, engine toggles + cost caps, per-engine breakdowns | ✅ |
| M5–M8 | Site audit, actions, content, tracking, assistant | later sprint |

**Sprint 1 (M1–M4) is complete** — the full *see → understand* loop on truthful data. Run an audit (with a key) and get genuine mentions, real cited sources, visibility/share-of-voice scores, and a yours-vs-third-party coverage gap. Every audit needs a real, search-enabled engine key — Limelight never fabricates results.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + shadcn/ui (Base UI primitives) ·
Postgres 16 + pgvector · Drizzle ORM · Auth.js v5 (credentials + JWT) · Inngest (jobs) ·
Vitest (evals) · Recharts · Resend. Package manager: **pnpm**. Node 20+.

Answer engines are **bring-your-own API keys** — Perplexity (M3), then OpenAI / Gemini / Claude
(M4) behind a common adapter. The internal generation model (prompt/content/detection) defaults to
Anthropic.

## Setup

```bash
# 1. Install deps
pnpm install

# 2. Configure env — copy the example and fill in secrets
cp .env.example .env
# Generate AUTH_SECRET and ENCRYPTION_KEY (32-byte base64 each):
#   openssl rand -base64 32

# 3. Start Postgres + pgvector (Docker)
docker compose up -d        # host port 5446 -> container 5432

# 4. Apply migrations (creates `users`, enables the vector extension)
pnpm db:migrate

# 5. Run the app
pnpm dev                    # http://localhost:3012
```

Visit `/signup` to create an account, then you land in the authenticated `/app` shell.

### Background jobs (from M3)

Audits run as durable Inngest jobs. For local development, run the dev server alongside `pnpm dev`:

```bash
npx inngest-cli@latest dev -u http://localhost:3012/api/inngest
```

### Ports

`5446` Postgres (host) · `3012` Next dev server. Both are configurable — chosen to avoid common
local collisions (5432 / 3000). Update `DATABASE_URL` and `AUTH_URL` in `.env` if you change them.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Run the app on :3012 |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest unit tests + `/evals` |
| `pnpm db:generate` | Generate a migration from `lib/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:studio` | Drizzle Studio |

## Auth

Email + password via **Auth.js v5 Credentials provider** with **JWT sessions** (the only session
strategy Credentials supports) and **bcryptjs** hashing. Because sessions are JWT-based, no
database session/account tables are needed — just `users`. `/app/**` is protected by `proxy.ts`
(Next 16's renamed middleware) as an optimistic edge check, and re-verified server-side in the
`/app` layout.

## Guardrails (in force every milestone)

- **No hardcoded secrets** — everything via `.env`; `.env.example` is the committed template.
- **Real citations only** — engine adapters use each provider's search/grounding path that returns
  genuine source URLs. A no-citation response stores zero citations; URLs are never parsed from prose
  or fabricated.
- **Confirm-gate every side-effect** — exports, sends, persistent config. Nothing auto-publishes.
- **Per-user model keys encrypted at rest** (from M4); respect `robots.txt` + rate limits on any crawl.
- **MIT licensed.**

## Database alternative

The repo defaults to local Docker Postgres for full self-hosting. Any Postgres 16 with the
`vector` extension works (e.g. Supabase) — just point `DATABASE_URL` at it and run `pnpm db:migrate`.

## License

[MIT](LICENSE).
