"use server";

import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  auditRuns,
  citations,
  mentions as mentionsT,
  modelResponses,
  prompts as promptsT,
  subjects as subjectsT,
  type AuditRun,
  type EngineId,
  type Sentiment,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { availableEnginesForUser, getUserSettings } from "@/lib/core/keys";
import { estimateAuditCost } from "@/lib/engines/pricing";
import { runAudit } from "@/lib/core/audit";
import { analyzeSources, type SourceAnalysis } from "@/lib/core/sources";
import { getActiveSubject } from "@/lib/actions/subjects";

function monthStartUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

async function monthlySpend(userId: string): Promise<number> {
  // Sum per-response costs (written during a run) so in-flight, partial, and
  // cost-capped runs are counted — not just finalized costActualUsd.
  const rows = await db
    .select({ c: modelResponses.costUsd })
    .from(modelResponses)
    .innerJoin(auditRuns, eq(modelResponses.auditRunId, auditRuns.id))
    .innerJoin(subjectsT, eq(auditRuns.subjectId, subjectsT.id))
    .where(and(eq(subjectsT.userId, userId), gte(auditRuns.createdAt, monthStartUtc())));
  return rows.reduce((s, r) => s + (r.c ?? 0), 0);
}

async function loadOwnedRun(auditRunId: string, userId: string): Promise<AuditRun> {
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, auditRunId)).limit(1);
  if (!run) throw new Error("Audit run not found.");
  const [subject] = await db
    .select({ userId: subjectsT.userId })
    .from(subjectsT)
    .where(eq(subjectsT.id, run.subjectId))
    .limit(1);
  if (!subject || subject.userId !== userId) throw new Error("Audit run not found.");
  return run;
}

export type AuditState = {
  subjectId: string;
  subjectName: string;
  subjectType: string;
  subjectDescription: string | null;
  enabledCount: number;
  hasCompetitors: boolean;
  run: AuditRun | null;
  canRun: boolean;
  missingKey: boolean;
  estimateUsd: number;
  samples: number;
  engines: EngineId[];
};

/** Overview state for the active subject (drives `/app`). */
export async function getAuditState(): Promise<AuditState | null> {
  const data = await getActiveSubject();
  if (!data) return null;
  const { subject, competitors, prompts } = data;
  const enabledCount = prompts.filter((p) => p.enabled).length;

  const [run] = await db
    .select()
    .from(auditRuns)
    .where(eq(auditRuns.subjectId, subject.id))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);

  const settings = await getUserSettings(subject.userId);
  const available = await availableEnginesForUser(subject.userId);
  const runnable = settings.enabledEngines.filter((e) => available.includes(e));
  const displayEngines = runnable.length > 0 ? runnable : settings.enabledEngines;

  return {
    subjectId: subject.id,
    subjectName: subject.name,
    subjectType: subject.type,
    subjectDescription: subject.description,
    enabledCount,
    hasCompetitors: competitors.length > 0,
    run: run ?? null,
    canRun: runnable.length > 0 && enabledCount > 0,
    missingKey: runnable.length === 0,
    estimateUsd: estimateAuditCost(enabledCount, displayEngines, settings.samples),
    samples: settings.samples,
    engines: displayEngines,
  };
}

export async function startAuditAction(): Promise<{ auditRunId: string }> {
  const data = await getActiveSubject();
  if (!data) throw new Error("Set up a subject first.");
  const enabledCount = data.prompts.filter((p) => p.enabled).length;
  if (enabledCount === 0) throw new Error("Enable at least one prompt to audit.");

  const settings = await getUserSettings(data.subject.userId);
  const available = await availableEnginesForUser(data.subject.userId);
  const engines = settings.enabledEngines.filter((e) => available.includes(e));
  if (engines.length === 0) {
    throw new Error(
      "Add an API key for at least one enabled engine in Settings. Limelight never fabricates results — a real, search-enabled engine is required.",
    );
  }

  // Cost caps — enforced server-side BEFORE spending.
  const estimate = estimateAuditCost(enabledCount, engines, settings.samples);
  const perRunCap = settings.maxSpendPerRunUsd;
  if (perRunCap != null && estimate > perRunCap) {
    throw new Error(
      `Estimated ~$${estimate.toFixed(2)} exceeds your per-run cap of $${perRunCap.toFixed(2)}. Reduce engines/samples or raise the cap in Settings.`,
    );
  }
  if (settings.maxSpendMonthlyUsd != null) {
    const spent = await monthlySpend(data.subject.userId);
    if (spent + estimate > settings.maxSpendMonthlyUsd) {
      throw new Error(
        `This run (~$${estimate.toFixed(2)}) would exceed your monthly cap of $${settings.maxSpendMonthlyUsd.toFixed(2)} (already spent $${spent.toFixed(2)} this month).`,
      );
    }
  }

  const { auditRunId } = await runAudit(data.subject.id, {
    engines,
    samples: settings.samples,
    temperature: settings.temperature,
    maxSpendUsd: settings.maxSpendPerRunUsd,
  });
  revalidatePath("/app");
  return { auditRunId };
}

export type RunProgress = {
  status: AuditRun["status"];
  promptsDone: number;
  promptsTotal: number;
  scores: AuditRun["scores"];
  error: string | null;
};

export async function getRunProgress(auditRunId: string): Promise<RunProgress> {
  const user = await requireUser();
  const run = await loadOwnedRun(auditRunId, user.id);
  return {
    status: run.status,
    promptsDone: run.promptsDone,
    promptsTotal: run.promptsTotal,
    scores: run.scores ?? null,
    error: run.error ?? null,
  };
}

// ── Visibility (per-prompt drill-down) ────────────────────────────────────

export type VisibilityEngineCell = {
  engine: EngineId;
  mentionedSamples: number;
  totalSamples: number;
  failedSamples: number;
  bestPosition: number | null;
  sentiment: Sentiment | null;
  confidence: number | null;
  searchEnabled: boolean;
  answer: string;
  sources: { url: string; domain: string; title: string | null }[];
};

export type VisibilityPrompt = {
  promptId: string;
  text: string;
  topic: string | null;
  intent: string | null;
  cells: VisibilityEngineCell[];
};

export type VisibilityData = {
  run: {
    id: string;
    status: AuditRun["status"];
    createdAt: Date;
    finishedAt: Date | null;
    error: string | null;
  };
  prompts: VisibilityPrompt[];
};

export async function getVisibilityData(auditRunId?: string): Promise<VisibilityData | null> {
  const user = await requireUser();
  const data = await getActiveSubject();
  if (!data) return null;
  const subjectId = data.subject.id;

  let run: AuditRun | undefined;
  if (auditRunId) {
    run = await loadOwnedRun(auditRunId, user.id);
  } else {
    [run] = await db
      .select()
      .from(auditRuns)
      .where(eq(auditRuns.subjectId, subjectId))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);
  }
  if (!run) return null;

  const responses = await db
    .select()
    .from(modelResponses)
    .where(eq(modelResponses.auditRunId, run.id));

  const promptRows = await db
    .select({
      id: promptsT.id,
      text: promptsT.text,
      topic: promptsT.topic,
      intent: promptsT.intent,
    })
    .from(promptsT)
    .where(eq(promptsT.subjectId, run.subjectId)); // the RUN's subject, not necessarily active
  const promptMap = new Map(promptRows.map((p) => [p.id, p]));

  const respIds = responses.map((r) => r.id);
  const subjMentions = respIds.length
    ? await db
        .select()
        .from(mentionsT)
        .where(
          and(inArray(mentionsT.modelResponseId, respIds), eq(mentionsT.targetType, "subject")),
        )
    : [];
  const cites = respIds.length
    ? await db.select().from(citations).where(inArray(citations.modelResponseId, respIds))
    : [];

  const mentionByResp = new Map(subjMentions.map((m) => [m.modelResponseId, m]));
  const citesByResp = new Map<string, typeof cites>();
  for (const c of cites) {
    const list = citesByResp.get(c.modelResponseId) ?? [];
    list.push(c);
    citesByResp.set(c.modelResponseId, list);
  }

  // Group responses by promptId -> engine.
  const byPrompt = new Map<string, Map<EngineId, typeof responses>>();
  for (const r of responses) {
    if (!byPrompt.has(r.promptId)) byPrompt.set(r.promptId, new Map());
    const engMap = byPrompt.get(r.promptId)!;
    if (!engMap.has(r.engine)) engMap.set(r.engine, []);
    engMap.get(r.engine)!.push(r);
  }

  const prompts: VisibilityPrompt[] = [];
  for (const [promptId, engMap] of byPrompt) {
    const p = promptMap.get(promptId);
    if (!p) continue;
    const cells: VisibilityEngineCell[] = [];
    for (const [engine, rs] of engMap) {
      const total = rs.length;
      let mentioned = 0;
      let failed = 0;
      let bestPosition: number | null = null;
      let sentiment: Sentiment | null = null;
      let confidence: number | null = null;
      // Representative sample: prefer one where mentioned, else first non-failed.
      const rep = rs.find((r) => mentionByResp.get(r.id)?.mentioned) ?? rs.find((r) => !r.error) ?? rs[0];

      for (const r of rs) {
        if (r.error) failed += 1;
        const m = mentionByResp.get(r.id);
        if (m?.mentioned) {
          mentioned += 1;
          if (m.position != null && (bestPosition == null || m.position < bestPosition)) {
            bestPosition = m.position;
          }
          if (sentiment == null) sentiment = m.sentiment ?? null;
          if (confidence == null) confidence = m.confidence ?? null;
        }
      }

      const repCites = rep ? (citesByResp.get(rep.id) ?? []) : [];
      cells.push({
        engine,
        mentionedSamples: mentioned,
        totalSamples: total,
        failedSamples: failed,
        bestPosition,
        sentiment,
        confidence,
        searchEnabled: rep?.searchEnabled ?? false,
        answer: rep?.rawText ?? "",
        sources: repCites
          .sort((a, b) => a.rank - b.rank)
          .map((c) => ({ url: c.url, domain: c.domain, title: c.title })),
      });
    }
    prompts.push({
      promptId,
      text: p.text,
      topic: p.topic,
      intent: p.intent,
      cells,
    });
  }

  return {
    run: {
      id: run.id,
      status: run.status,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      error: run.error ?? null,
    },
    prompts,
  };
}

/** Source analytics for the active subject's latest run (or a specified run). */
export async function getSourcesData(auditRunId?: string): Promise<SourceAnalysis | null> {
  const user = await requireUser();
  const data = await getActiveSubject();
  if (!data) return null;

  let runId = auditRunId;
  if (runId) {
    await loadOwnedRun(runId, user.id); // ownership check
  } else {
    const [run] = await db
      .select({ id: auditRuns.id })
      .from(auditRuns)
      .where(eq(auditRuns.subjectId, data.subject.id))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);
    if (!run) return null;
    runId = run.id;
  }
  return analyzeSources(runId);
}
