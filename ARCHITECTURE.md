# Architecture

Condensed from the build plan (§4/§5). The one rule that matters most is the **service layer**.

## The service-layer rule

Every capability is a plain, typed function under `lib/core/*` — the *verbs* the product performs.
**The UI and API routes call these; business logic never lives in React components.** This keeps the
core separable and testable, and is the only forward-looking concession in Phase 1 (a later phase
could wrap these same verbs without rewriting them). We do **not** build that wrapper now.

Planned verbs (land per milestone):

```
generatePromptSet · runAudit · fanOut · detectMention · extractCitations ·
scoreVisibility · analyzeSources · auditSite · findContentGaps ·
generateContent · generateSchema · exportContent · askAssistant · scheduleTracking · runDigest
```

## Shape

```
Next.js (App Router, TS)
  ├─ (marketing)/        public landing + pricing
  ├─ (auth)/             login + signup
  ├─ app/**              authenticated dashboard (thin pages → call lib/core)
  └─ api/                route handlers (auth, inngest, …)
        │ thin controllers — no business logic in components
        ▼
  lib/core/*             THE VERBS (typed in/out)
        │
        ├─ lib/engines/  answer-engine adapters (perplexity, openai, gemini, claude)
        ├─ lib/crawl/    robots-respecting fetch + readiness checks (M5)
        ├─ lib/schema/   JSON-LD builders + validation (M6)
        └─ lib/db/        Drizzle schema, client, migrations
        ▼
  Postgres + pgvector  ·  Inngest jobs (durable audits/digests)
```

## Layout

```
app/                     routes (marketing, auth, app/**, api/**)
lib/
  core/                  the verbs (M2+)
  engines/               answer-engine adapters (M3+)
  crawl/                 site crawler (M5)
  schema/                JSON-LD (M6)
  db/                    schema.ts, client.ts, users.ts, migrations/
  inngest/               client + functions
  actions/               server actions (thin → call core)
  auth.ts                Auth.js Node instance
  session.ts             getCurrentUser / requireUser
auth.config.ts           edge-safe Auth.js config (shared with proxy.ts)
proxy.ts                 Next 16 middleware (optimistic /app gate)
components/
  ui/                    shadcn/ui (Base UI primitives)
  shell/                 sidebar, topbar, nav, user menu
  auth/, brand/          forms, logo
evals/                   fixtures/ (captured responses) + cases/ + run.ts
```

## Engine adapters (get this right or the product is fake)

Each engine implements one interface: `query(prompt, opts) -> { text, citations, model, tokens, costUsd }`.
Plain chat completions don't browse and **will hallucinate URLs**, so every adapter uses the
provider's *search/grounding* path that returns real source links, and records `searchEnabled`
per response. Provider response shapes differ (Perplexity `search_results`, OpenAI `url_citation`
annotations, Gemini `groundingMetadata`, Claude `web_search_tool_result`) and are mapped explicitly
— never assume a shared shape, never regex prose for links.

## Data model (added per milestone)

`users` (M1) → `subjects`, `competitors`, `prompts` (M2) → `audit_runs`, `model_responses`,
`mentions`, `citations` (M3) → `provider_keys`, source views (M4) → `site_audits`,
`content_drafts`, `schedules`, `embeddings` (M5+).

## Request flow (audit, from M3)

1. User clicks **Run audit** → server action calls `runAudit(subjectId, config)`.
2. `runAudit` enqueues an Inngest job and returns a run id (the UI doesn't block).
3. The job fans prompts × engines × samples → stores `model_responses`.
4. Per response: `detectMention` + `extractCitations` → store `mentions`, `citations`.
5. `scoreVisibility` + `analyzeSources` aggregate → run marked complete.
6. The dashboard polls run status, then renders scores + drill-downs.

## Trust layer (the actual job)

The LLM calls are the easy ~5%. The work is the trust layer: real-citation enforcement, mention
disambiguation with confidence + an eval set, share-of-voice with a stated denominator, N-sample
nondeterminism handling, JSON-LD validation, robots-respecting crawls, and enforced cost caps.
The `/evals` harness grows every milestone and runs deterministically against saved fixtures.
