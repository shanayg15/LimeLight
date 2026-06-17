import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * M1 schema: `users` only. Domain tables (subjects, prompts, audits, …) are
 * added per-milestone so each migration stays reviewable. pgvector is enabled
 * in the docker init + first migration for the embeddings columns that arrive later.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  // Nullable so OAuth users (a later option) don't require a password.
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ── M2: subject profile, competitors, prompt set ────────────────────────

export type SubjectType = "person" | "business" | "product";
export type PromptSource = "generated" | "manual";
export type PromptIntent = "discovery" | "comparison" | "reputation" | "how_to";

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  // 'person' | 'business' | 'product' — person-first default (build plan §13.3).
  type: text("type").notNull().default("person"),
  aliases: text("aliases").array().notNull().default(sql`'{}'`),
  siteUrl: text("site_url"),
  description: text("description"),
  brandVoice: text("brand_voice"),
  topics: text("topics").array().notNull().default(sql`'{}'`),
  // v1 UX assumes one active subject per user; the switcher flips this flag.
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const competitors = pgTable("competitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  aliases: text("aliases").array().notNull().default(sql`'{}'`),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const prompts = pgTable("prompts", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  source: text("source").notNull(), // 'generated' | 'manual'
  topic: text("topic"),
  intent: text("intent"), // 'discovery' | 'comparison' | 'reputation' | 'how_to'
  enabled: boolean("enabled").notNull().default(true),
  // A user-edited generated prompt is preserved on regenerate (not clobbered).
  edited: boolean("edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;
export type Competitor = typeof competitors.$inferSelect;
export type NewCompetitor = typeof competitors.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;

// ── M3: audit runs, model responses, mentions, citations ────────────────

export type EngineId = "perplexity" | "openai" | "gemini" | "claude";
export type AuditStatus = "queued" | "running" | "complete" | "failed";
export type Sentiment = "positive" | "neutral" | "negative";
export type MentionTargetType = "subject" | "competitor";

export type AuditConfig = {
  engines: EngineId[];
  samples: number;
  temperature: number;
  /** Snapshot of the per-run cost cap; the job stops gracefully if exceeded. */
  maxSpendUsd?: number | null;
};

export type AuditScores = {
  /** % of enabled prompts where the subject was mentioned in ≥1 sample (0–1). */
  visibilityScore: number;
  /** distinct prompts where the subject was mentioned in ≥1 sample. */
  promptsMentionedCount: number;
  /** subject mentions ÷ (subject + competitor mentions); null if no competitors. */
  shareOfVoice: number | null;
  /** mean of non-null subject positions; null if never mentioned. */
  avgPosition: number | null;
  /** how often the subject's own domain appears in citations (0–1 of prompts). */
  citationFrequency: number;
  promptCount: number;
  subjectMentionCount: number;
  competitorMentionCount: number;
  hasCompetitors: boolean;
  /** Per-engine visibility breakdown (% of that engine's prompts that mention you). */
  perEngine: { engine: EngineId; visibilityScore: number; promptsMentioned: number; promptCount: number }[];
};

export const auditRuns = pgTable("audit_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("queued").$type<AuditStatus>(),
  config: jsonb("config").notNull().$type<AuditConfig>(),
  costEstimateUsd: doublePrecision("cost_estimate_usd"),
  costActualUsd: doublePrecision("cost_actual_usd"),
  // Cached aggregate scores (also derivable from rows).
  scores: jsonb("scores").$type<AuditScores>(),
  promptsTotal: integer("prompts_total").notNull().default(0),
  promptsDone: integer("prompts_done").notNull().default(0),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const modelResponses = pgTable("model_responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditRunId: uuid("audit_run_id")
    .notNull()
    .references(() => auditRuns.id, { onDelete: "cascade" }),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => prompts.id, { onDelete: "cascade" }),
  engine: text("engine").notNull().$type<EngineId>(),
  model: text("model").notNull(),
  sampleIdx: integer("sample_idx").notNull().default(0),
  rawText: text("raw_text").notNull().default(""),
  // False if the engine couldn't use a real search/grounding path for this call.
  searchEnabled: boolean("search_enabled").notNull().default(false),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  costUsd: doublePrecision("cost_usd"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const mentions = pgTable("mentions", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelResponseId: uuid("model_response_id")
    .notNull()
    .references(() => modelResponses.id, { onDelete: "cascade" }),
  targetType: text("target_type").notNull().$type<MentionTargetType>(),
  // subjectId or competitorId depending on targetType.
  targetId: uuid("target_id").notNull(),
  mentioned: boolean("mentioned").notNull().default(false),
  position: integer("position"), // 1 = named first; null if not mentioned
  sentiment: text("sentiment").$type<Sentiment>(),
  snippet: text("snippet"),
  confidence: doublePrecision("confidence"), // 0–1
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const citations = pgTable("citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  modelResponseId: uuid("model_response_id")
    .notNull()
    .references(() => modelResponses.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  domain: text("domain").notNull(),
  title: text("title"),
  rank: integer("rank").notNull().default(0), // order cited
  resolves: boolean("resolves"), // set later if verified
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type AuditRun = typeof auditRuns.$inferSelect;
export type ModelResponse = typeof modelResponses.$inferSelect;
export type Mention = typeof mentions.$inferSelect;
export type Citation = typeof citations.$inferSelect;

// ── M4: BYO provider keys (encrypted) + per-user audit settings ──────────

/** The `claude` engine uses the `anthropic` key; generation uses anthropic/openai. */
export type KeyProvider = "perplexity" | "openai" | "gemini" | "anthropic";

export const providerKeys = pgTable(
  "provider_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<KeyProvider>(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [unique("provider_keys_user_provider_uniq").on(t.userId, t.provider)],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  enabledEngines: jsonb("enabled_engines")
    .notNull()
    .default(sql`'["perplexity"]'::jsonb`)
    .$type<EngineId[]>(),
  samples: integer("samples").notNull().default(3),
  temperature: doublePrecision("temperature").notNull().default(0.2),
  maxSpendPerRunUsd: doublePrecision("max_spend_per_run_usd"),
  maxSpendMonthlyUsd: doublePrecision("max_spend_monthly_usd"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type ProviderKeyRow = typeof providerKeys.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;

// ── M5: site crawl audit + recommended actions ───────────────────────────

export type SiteAuditSeverity = "high" | "med" | "low";
export type SiteAuditArea = "schema" | "structure" | "fetchability" | "entity" | "topics";

export type SiteAuditFinding = {
  id: string;
  severity: SiteAuditSeverity;
  area: SiteAuditArea;
  message: string;
  /** A concrete, fixable detail — never a vague "improve your SEO". */
  evidence?: string;
  /** Which crawled URLs the finding applies to. */
  pages?: string[];
};

export const siteAudits = pgTable("site_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  aiReadinessScore: integer("ai_readiness_score").notNull().default(0),
  findings: jsonb("findings").notNull().$type<SiteAuditFinding[]>().default(sql`'[]'::jsonb`),
  pagesCrawled: integer("pages_crawled").notNull().default(0),
  /** Honest signal: false if the site is JS-only/empty and we couldn't read content. */
  readable: boolean("readable").notNull().default(true),
  /** Which crawled topics the site actually covers (drives Create-vs-Improve). */
  topicCoverage: jsonb("topic_coverage").notNull().$type<Record<string, boolean>>().default(sql`'{}'::jsonb`),
  notes: text("notes"),
  crawledAt: timestamp("crawled_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type SiteAudit = typeof siteAudits.$inferSelect;

// ── M6: embeddings (pgvector) + content drafts ───────────────────────────

export type EmbeddingSourceType = "own_page" | "cited_page";

/**
 * text-embedding-3-small is 1536-dim. `embedding` is nullable: in the keyless
 * path we still store the chunk text and retrieve lexically (real grounding over
 * the user's own data — never fabrication), backfilling vectors when a key exists.
 */
export const EMBEDDING_DIM = 1536;

export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull().$type<EmbeddingSourceType>(),
    url: text("url").notNull(),
    topic: text("topic"),
    chunkIdx: integer("chunk_idx").notNull().default(0),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }),
    /** Embedding model id, or 'lexical' when stored without a vector. */
    model: text("model").notNull().default("lexical"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("embeddings_subject_idx").on(t.subjectId),
    // HNSW cosine index for the vector path (skips null embeddings).
    index("embeddings_vector_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export type ContentKind = "create" | "improve";
export type DraftStatus = "draft" | "approved" | "exported";
export type FaqItem = { question: string; answer: string };

export const contentDrafts = pgTable("content_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  subjectId: uuid("subject_id")
    .notNull()
    .references(() => subjects.id, { onDelete: "cascade" }),
  opportunityId: text("opportunity_id"),
  kind: text("kind").notNull().$type<ContentKind>(),
  title: text("title").notNull(),
  bodyMd: text("body_md").notNull().default(""),
  faq: jsonb("faq").notNull().$type<FaqItem[]>().default(sql`'[]'::jsonb`),
  jsonLd: jsonb("json_ld").$type<unknown>(),
  status: text("status").notNull().default("draft").$type<DraftStatus>(),
  targetTopic: text("target_topic"),
  /** 'model' = LLM-generated; 'scaffold' = keyless grounded scaffold (no invented facts). */
  source: text("source").notNull().default("model"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type Embedding = typeof embeddings.$inferSelect;
export type ContentDraft = typeof contentDrafts.$inferSelect;
