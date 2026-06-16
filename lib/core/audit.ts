import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  auditRuns,
  citations,
  competitors as competitorsT,
  mentions as mentionsT,
  modelResponses,
  prompts as promptsT,
  subjects as subjectsT,
  type AuditConfig,
  type AuditRun,
  type Competitor,
  type EngineId,
  type Subject,
} from "@/lib/db/schema";
import { getEngine } from "@/lib/engines";
import { getEngineKey } from "@/lib/core/keys";
import { ENGINE_PRICING, estimateAuditCost } from "@/lib/engines/pricing";
import { EngineHttpError } from "@/lib/engines/perplexity";
import { normalizeDomain } from "@/lib/engines/types";
import { detectMention } from "@/lib/core/detect";
import { extractCitations } from "@/lib/core/extract";
import { scoreVisibility, type ScoreResponseInput } from "@/lib/core/score";
import { inngest } from "@/lib/inngest/client";

export const AUDIT_EVENT = "audit/run.requested";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = e instanceof EngineHttpError ? e.status : 0;
      const retryable = status === 0 || status === 429 || status >= 500; // network/transient
      if (!retryable || attempt === retries) throw e;
      // Jittered backoff so concurrent samples don't retry in lockstep on a 429.
      await sleep(300 * 2 ** attempt * (0.5 + Math.random() * 0.5));
    }
  }
  throw lastErr;
}

/**
 * Create an audit run and enqueue the durable Inngest job. Returns immediately
 * with the run id (the fan-out happens off the request cycle). Assumes the
 * caller already verified subject ownership + that at least one engine is usable.
 */
export async function runAudit(
  subjectId: string,
  config: AuditConfig,
): Promise<{ auditRunId: string; estimateUsd: number; promptCount: number }> {
  const enabled = await db
    .select({ id: promptsT.id })
    .from(promptsT)
    .where(and(eq(promptsT.subjectId, subjectId), eq(promptsT.enabled, true)));
  const promptCount = enabled.length;
  const estimateUsd = estimateAuditCost(promptCount, config.engines, config.samples);

  const [run] = await db
    .insert(auditRuns)
    .values({
      subjectId,
      status: "queued",
      config,
      costEstimateUsd: estimateUsd,
      promptsTotal: promptCount,
      promptsDone: 0,
    })
    .returning({ id: auditRuns.id });

  try {
    await inngest.send({ name: AUDIT_EVENT, data: { auditRunId: run.id } });
  } catch {
    // Don't leave an orphaned queued run if the job couldn't be enqueued.
    await db.delete(auditRuns).where(eq(auditRuns.id, run.id));
    throw new Error(
      "Couldn't start the audit job. In local dev, run `npx inngest-cli@latest dev -u http://localhost:3012/api/inngest`.",
    );
  }
  return { auditRunId: run.id, estimateUsd, promptCount };
}

// ── Execution (called by the Inngest job) ─────────────────────────────────

export type AuditContext = {
  run: AuditRun;
  subject: Subject;
  prompts: { id: string; text: string }[];
  competitors: Competitor[];
  engines: EngineId[];
  keys: Partial<Record<EngineId, string>>;
  samples: number;
  temperature: number;
  subjectDomain: string | null;
};

export async function loadAuditContext(auditRunId: string): Promise<AuditContext> {
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, auditRunId)).limit(1);
  if (!run) throw new Error(`Audit run ${auditRunId} not found.`);
  const [subject] = await db.select().from(subjectsT).where(eq(subjectsT.id, run.subjectId)).limit(1);
  if (!subject) throw new Error(`Subject for run ${auditRunId} not found.`);

  const enabledPrompts = await db
    .select({ id: promptsT.id, text: promptsT.text })
    .from(promptsT)
    .where(and(eq(promptsT.subjectId, run.subjectId), eq(promptsT.enabled, true)));
  const comps = await db.select().from(competitorsT).where(eq(competitorsT.subjectId, run.subjectId));

  const config = run.config;
  // Resolve per-user keys (encrypted DB key → env fallback). Drop engines with no key.
  const engines: EngineId[] = [];
  const keys: Partial<Record<EngineId, string>> = {};
  for (const e of config.engines) {
    if (!getEngine(e)) continue;
    const key = await getEngineKey(subject.userId, e);
    if (key) {
      engines.push(e);
      keys[e] = key;
    }
  }

  return {
    run,
    subject,
    prompts: enabledPrompts,
    competitors: comps,
    engines,
    keys,
    samples: Math.max(1, config.samples),
    temperature: config.temperature,
    subjectDomain: subject.siteUrl ? normalizeDomain(subject.siteUrl) : null,
  };
}

/**
 * Audit ONE prompt: fan across engines × samples, store model_responses +
 * mentions + citations, and return the per-response inputs for scoring. Engine
 * failures are recorded as failed responses — they never abort the run.
 */
export async function auditOnePrompt(
  ctx: AuditContext,
  prompt: { id: string; text: string },
): Promise<ScoreResponseInput[]> {
  const detectSubject = {
    id: ctx.subject.id,
    name: ctx.subject.name,
    aliases: ctx.subject.aliases,
    description: ctx.subject.description,
    siteUrl: ctx.subject.siteUrl,
  };
  const detectCompetitors = ctx.competitors.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases }));

  // Idempotency: a durable step replay re-runs the WHOLE step, so clear any
  // partial writes for this prompt first (FK cascade removes mentions + citations).
  // This makes the per-prompt step safe to re-run without duplicating rows.
  await db
    .delete(modelResponses)
    .where(and(eq(modelResponses.auditRunId, ctx.run.id), eq(modelResponses.promptId, prompt.id)));

  const out: ScoreResponseInput[] = [];

  for (const engineId of ctx.engines) {
    const engine = getEngine(engineId);
    const apiKey = ctx.keys[engineId];
    if (!engine || !apiKey) continue;

    const settled = await Promise.all(
      Array.from({ length: ctx.samples }, (_, sampleIdx) => sampleIdx).map(async (sampleIdx) => {
        try {
          const result = await withRetry(() =>
            engine.query(prompt.text, {
              samples: 1, // this loop owns the fan-out; one sample per call
              temperature: ctx.temperature,
              apiKey,
            }),
          );
          return { sampleIdx, result, error: null as string | null };
        } catch (e) {
          // Store a normalized error — never the provider's raw response body.
          const status = e instanceof EngineHttpError ? e.status : 0;
          const error = status
            ? `${engineId} request failed (HTTP ${status})`
            : e instanceof Error
              ? e.message.slice(0, 160)
              : "engine error";
          return { sampleIdx, result: null, error };
        }
      }),
    );

    for (const s of settled) {
      const [mr] = await db
        .insert(modelResponses)
        .values({
          auditRunId: ctx.run.id,
          promptId: prompt.id,
          engine: engineId,
          model: s.result?.model ?? ENGINE_PRICING[engineId].defaultModel,
          sampleIdx: s.sampleIdx,
          rawText: s.result?.text ?? "",
          searchEnabled: s.result?.searchEnabled ?? false,
          tokensIn: s.result?.tokensIn ?? null,
          tokensOut: s.result?.tokensOut ?? null,
          costUsd: s.result?.costUsd ?? null,
          error: s.error,
        })
        .returning({ id: modelResponses.id });

      if (!s.result || s.error) {
        out.push({
          promptId: prompt.id,
          engine: engineId,
          failed: true,
          subjectMentioned: false,
          subjectPosition: null,
          competitorMentionedCount: 0,
          citedSubjectDomain: false,
        });
        continue;
      }

      // Citations (real sources only; never fabricated).
      const cites = extractCitations(s.result);
      if (cites.length > 0) {
        await db.insert(citations).values(
          cites.map((c) => ({
            modelResponseId: mr.id,
            url: c.url,
            domain: c.domain,
            title: c.title ?? null,
            rank: c.rank,
          })),
        );
      }
      const citedSubjectDomain = ctx.subjectDomain
        ? cites.some((c) => c.domain === ctx.subjectDomain)
        : false;

      // Mentions (disambiguated; never throws).
      const detected = await detectMention(s.result.text, detectSubject, detectCompetitors);
      if (detected.length > 0) {
        await db.insert(mentionsT).values(
          detected.map((d) => ({
            modelResponseId: mr.id,
            targetType: d.targetType,
            targetId: d.targetId,
            mentioned: d.mentioned,
            position: d.position,
            sentiment: d.sentiment,
            snippet: d.snippet,
            confidence: d.confidence,
          })),
        );
      }
      const subj = detected.find((d) => d.targetType === "subject");
      out.push({
        promptId: prompt.id,
        engine: engineId,
        failed: false,
        subjectMentioned: subj?.mentioned ?? false,
        subjectPosition: subj?.position ?? null,
        competitorMentionedCount: detected.filter((d) => d.targetType === "competitor" && d.mentioned)
          .length,
        citedSubjectDomain,
      });
    }
  }

  return out;
}

export async function sumActualCost(auditRunId: string): Promise<number> {
  const rows = await db
    .select({ c: modelResponses.costUsd })
    .from(modelResponses)
    .where(eq(modelResponses.auditRunId, auditRunId));
  return rows.reduce((s, r) => s + (r.c ?? 0), 0);
}

export async function finalizeRun(
  ctx: AuditContext,
  responses: ScoreResponseInput[],
): Promise<void> {
  const scores = scoreVisibility({
    hasCompetitors: ctx.competitors.length > 0,
    responses,
  });
  const costActualUsd = await sumActualCost(ctx.run.id);
  await db
    .update(auditRuns)
    .set({ status: "complete", scores, costActualUsd, finishedAt: new Date() })
    .where(eq(auditRuns.id, ctx.run.id));
}
