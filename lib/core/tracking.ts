import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AuditScores, Cadence, EngineId, Schedule } from "@/lib/db/schema";

/**
 * Tracking over time (M7): trend series + run-to-run "what changed" diffs +
 * schedule cadence math. The pure cores (nextRunFrom / selectDueSchedules /
 * computeTrends / diffRuns) are eval-tested; DB wrappers below load data and
 * call them. No new scoring math — just orchestration of existing run data.
 */

// ── Cadence ─────────────────────────────────────────────────────────────────

export function nextRunFrom(cadence: Cadence, from: Date): Date {
  const d = new Date(from.getTime());
  if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (cadence === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

/** Due = enabled, has a nextRunAt, and it's in the past. Pure (deterministic given `now`). */
export function selectDueSchedules<T extends Pick<Schedule, "enabled" | "nextRunAt">>(schedules: T[], now: Date): T[] {
  return schedules.filter((s) => s.enabled && s.nextRunAt != null && s.nextRunAt.getTime() <= now.getTime());
}

// ── Trends ────────────────────────────────────────────────────────────────

export type TrendPoint = {
  runId: string;
  date: string; // ISO
  visibility: number;
  shareOfVoice: number | null;
  avgPosition: number | null;
  citationFrequency: number;
};
export type EngineTrend = { engine: EngineId; points: { runId: string; date: string; visibility: number }[] };
export type TrendData = { overall: TrendPoint[]; perEngine: EngineTrend[] };

export type TrendRun = { id: string; createdAt: Date; scores: AuditScores | null };

/** Assemble ordered trend series (overall + per engine) from completed runs. */
export function computeTrends(runs: TrendRun[]): TrendData {
  const ordered = runs
    .filter((r) => r.scores)
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const overall: TrendPoint[] = ordered.map((r) => ({
    runId: r.id,
    date: r.createdAt.toISOString(),
    visibility: r.scores!.visibilityScore,
    shareOfVoice: r.scores!.shareOfVoice,
    avgPosition: r.scores!.avgPosition,
    citationFrequency: r.scores!.citationFrequency,
  }));

  const byEngine = new Map<EngineId, { runId: string; date: string; visibility: number }[]>();
  for (const r of ordered) {
    for (const pe of r.scores!.perEngine ?? []) {
      const arr = byEngine.get(pe.engine) ?? [];
      arr.push({ runId: r.id, date: r.createdAt.toISOString(), visibility: pe.visibilityScore });
      byEngine.set(pe.engine, arr);
    }
  }
  const perEngine: EngineTrend[] = [...byEngine.entries()].map(([engine, points]) => ({ engine, points }));
  return { overall, perEngine };
}

// ── Diff ("what changed") ────────────────────────────────────────────────────

export type PromptState = { promptId: string; text: string; mentioned: boolean; position: number | null };
export type RunSnapshot = {
  runId: string;
  createdAt: Date;
  engines: EngineId[];
  scores: AuditScores | null;
  prompts: PromptState[];
  domains: string[];
};

export type MentionChange = { promptId: string; text: string };
export type PositionMove = { promptId: string; text: string; from: number | null; to: number | null };

export type RunDiff = {
  /** True if the two runs used different engine sets — deltas aren't strictly like-for-like. */
  configMismatch: boolean;
  enginesA: EngineId[];
  enginesB: EngineId[];
  gainedMentions: MentionChange[]; // mentioned in B, not in A
  lostMentions: MentionChange[]; // mentioned in A, not in B
  positionImproved: PositionMove[]; // mentioned in both, rank got better (lower)
  positionRegressed: PositionMove[];
  newDomains: string[]; // cited in B, not A
  lostDomains: string[]; // cited in A, not B
  visibilityDelta: number | null; // B − A
  shareOfVoiceDelta: number | null;
};

/** Diff run A (older) → run B (newer). Pure + deterministic. */
export function diffRuns(a: RunSnapshot, b: RunSnapshot): RunDiff {
  const aByPrompt = new Map(a.prompts.map((p) => [p.promptId, p]));
  const bByPrompt = new Map(b.prompts.map((p) => [p.promptId, p]));

  const gainedMentions: MentionChange[] = [];
  const lostMentions: MentionChange[] = [];
  const positionImproved: PositionMove[] = [];
  const positionRegressed: PositionMove[] = [];

  for (const [promptId, bp] of bByPrompt) {
    const ap = aByPrompt.get(promptId);
    if (bp.mentioned && !(ap?.mentioned ?? false)) gainedMentions.push({ promptId, text: bp.text });
    if (ap?.mentioned && bp.mentioned && ap.position != null && bp.position != null && ap.position !== bp.position) {
      const move: PositionMove = { promptId, text: bp.text, from: ap.position, to: bp.position };
      if (bp.position < ap.position) positionImproved.push(move);
      else positionRegressed.push(move);
    }
  }
  for (const [promptId, ap] of aByPrompt) {
    const bp = bByPrompt.get(promptId);
    if (ap.mentioned && !(bp?.mentioned ?? false)) lostMentions.push({ promptId, text: ap.text });
  }

  const aDomains = new Set(a.domains);
  const bDomains = new Set(b.domains);
  const newDomains = [...bDomains].filter((d) => !aDomains.has(d));
  const lostDomains = [...aDomains].filter((d) => !bDomains.has(d));

  const delta = (x: number | null | undefined, y: number | null | undefined): number | null =>
    x == null || y == null ? null : y - x;

  const enginesA = [...a.engines].sort();
  const enginesB = [...b.engines].sort();
  const configMismatch = enginesA.join(",") !== enginesB.join(",");

  return {
    configMismatch,
    enginesA: a.engines,
    enginesB: b.engines,
    gainedMentions,
    lostMentions,
    positionImproved,
    positionRegressed,
    newDomains,
    lostDomains,
    visibilityDelta: delta(a.scores?.visibilityScore, b.scores?.visibilityScore),
    shareOfVoiceDelta: delta(a.scores?.shareOfVoice ?? null, b.scores?.shareOfVoice ?? null),
  };
}

// ── DB wrappers ──────────────────────────────────────────────────────────────

async function dbi() {
  return (await import("@/lib/db/client")).db;
}

export type ScheduleOptions = {
  enabled: boolean;
  engines: EngineId[];
  samples: number;
  channels: { email: boolean };
};

/**
 * Create/update the subject's schedule. Computes nextRunAt from now when enabled.
 * Creating/enabling a standing schedule is a persistent-config change → the UI
 * gates this behind a confirm dialog.
 */
export async function scheduleTracking(subjectId: string, cadence: Cadence, opts: ScheduleOptions, now: Date = new Date()): Promise<Schedule> {
  const db = await dbi();
  const { schedules } = await import("@/lib/db/schema");
  const nextRunAt = opts.enabled ? nextRunFrom(cadence, now) : null;
  const [row] = await db
    .insert(schedules)
    .values({
      subjectId,
      cadence,
      enabled: opts.enabled,
      engines: opts.engines,
      samples: opts.samples,
      channels: opts.channels,
      nextRunAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schedules.subjectId,
      set: { cadence, enabled: opts.enabled, engines: opts.engines, samples: opts.samples, channels: opts.channels, nextRunAt, updatedAt: now },
    })
    .returning();
  return row;
}

export async function getSchedule(subjectId: string): Promise<Schedule | null> {
  const db = await dbi();
  const { schedules } = await import("@/lib/db/schema");
  const [row] = await db.select().from(schedules).where(eq(schedules.subjectId, subjectId)).limit(1);
  return row ?? null;
}

/** Build the per-prompt + domain snapshot a diff needs for one run. */
export async function buildRunSnapshot(runId: string): Promise<RunSnapshot | null> {
  const db = await dbi();
  const { auditRuns, modelResponses, mentions, citations, prompts } = await import("@/lib/db/schema");
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, runId)).limit(1);
  if (!run) return null;

  const responses = await db
    .select({ id: modelResponses.id, promptId: modelResponses.promptId, searchEnabled: modelResponses.searchEnabled })
    .from(modelResponses)
    .where(eq(modelResponses.auditRunId, runId));
  const respIds = responses.map((r) => r.id);

  const subjMentions = respIds.length
    ? await db
        .select({ modelResponseId: mentions.modelResponseId, mentioned: mentions.mentioned, position: mentions.position })
        .from(mentions)
        .where(and(inArray(mentions.modelResponseId, respIds), eq(mentions.targetType, "subject")))
    : [];
  const cites = respIds.length
    ? await db.select({ modelResponseId: citations.modelResponseId, domain: citations.domain }).from(citations).where(inArray(citations.modelResponseId, respIds))
    : [];

  const promptRows = await db
    .select({ id: prompts.id, text: prompts.text })
    .from(prompts)
    .where(eq(prompts.subjectId, run.subjectId));
  const textById = new Map(promptRows.map((p) => [p.id, p.text]));

  const searchEnabledResp = new Set(responses.filter((r) => r.searchEnabled).map((r) => r.id));
  const mByResp = new Map(subjMentions.map((m) => [m.modelResponseId, m]));

  // Per-prompt: mentioned if any sample mentioned; best (lowest) position.
  const byPrompt = new Map<string, PromptState>();
  for (const r of responses) {
    const st = byPrompt.get(r.promptId) ?? { promptId: r.promptId, text: textById.get(r.promptId) ?? "", mentioned: false, position: null };
    const m = mByResp.get(r.id);
    if (m?.mentioned) {
      st.mentioned = true;
      if (m.position != null && (st.position == null || m.position < st.position)) st.position = m.position;
    }
    byPrompt.set(r.promptId, st);
  }

  const domains = new Set<string>();
  for (const c of cites) if (searchEnabledResp.has(c.modelResponseId)) domains.add(c.domain.toLowerCase());

  return {
    runId,
    createdAt: run.createdAt,
    engines: run.config.engines,
    scores: run.scores ?? null,
    prompts: [...byPrompt.values()],
    domains: [...domains],
  };
}

export type TrackingData = {
  trends: TrendData;
  history: { id: string; createdAt: Date; engines: EngineId[]; scores: AuditScores | null; costActualUsd: number | null }[];
  runCount: number;
};

export async function getTrackingData(subjectId: string): Promise<TrackingData> {
  const db = await dbi();
  const { auditRuns } = await import("@/lib/db/schema");
  const runs = await db
    .select()
    .from(auditRuns)
    .where(and(eq(auditRuns.subjectId, subjectId), eq(auditRuns.status, "complete")))
    .orderBy(asc(auditRuns.createdAt));
  const trends = computeTrends(runs.map((r) => ({ id: r.id, createdAt: r.createdAt, scores: r.scores ?? null })));
  const history = runs
    .slice()
    .reverse()
    .map((r) => ({ id: r.id, createdAt: r.createdAt, engines: r.config.engines, scores: r.scores ?? null, costActualUsd: r.costActualUsd }));
  return { trends, history, runCount: runs.length };
}

export async function getDiffData(subjectId: string, runAId?: string, runBId?: string): Promise<RunDiff | null> {
  const db = await dbi();
  const { auditRuns } = await import("@/lib/db/schema");
  let aId = runAId;
  let bId = runBId;
  if (!aId || !bId) {
    const recent = await db
      .select({ id: auditRuns.id })
      .from(auditRuns)
      .where(and(eq(auditRuns.subjectId, subjectId), eq(auditRuns.status, "complete")))
      .orderBy(desc(auditRuns.createdAt))
      .limit(2);
    if (recent.length < 2) return null;
    bId = recent[0].id; // newest
    aId = recent[1].id; // previous
  }
  const [a, b] = await Promise.all([buildRunSnapshot(aId), buildRunSnapshot(bId)]);
  if (!a || !b) return null;
  return diffRuns(a, b);
}

// ── Cron helpers ──────────────────────────────────────────────────────────

/** Pure cost-cap decision for a scheduled run. Eval-tested. */
export function capDecision(
  estimate: number,
  monthlySpent: number,
  caps: { perRun?: number | null; monthly?: number | null },
): { allowed: boolean; reason?: string } {
  if (caps.perRun != null && estimate > caps.perRun) {
    return { allowed: false, reason: `over per-run cap ($${estimate.toFixed(2)} > $${caps.perRun.toFixed(2)})` };
  }
  if (caps.monthly != null && monthlySpent + estimate > caps.monthly) {
    return { allowed: false, reason: `would exceed monthly cap ($${(monthlySpent + estimate).toFixed(2)} > $${caps.monthly.toFixed(2)})` };
  }
  return { allowed: true };
}

async function monthlySpendForUser(userId: string): Promise<number> {
  const db = await dbi();
  const { gte } = await import("drizzle-orm");
  const { modelResponses, auditRuns, subjects } = await import("@/lib/db/schema");
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db
    .select({ c: modelResponses.costUsd })
    .from(modelResponses)
    .innerJoin(auditRuns, eq(modelResponses.auditRunId, auditRuns.id))
    .innerJoin(subjects, eq(auditRuns.subjectId, subjects.id))
    .where(and(eq(subjects.userId, userId), gte(auditRuns.createdAt, monthStart)));
  return rows.reduce((s, r) => s + (r.c ?? 0), 0);
}

/**
 * Fire one due schedule: enforce cost caps (skip + record reason if over),
 * else create the audit run (tagged scheduleId), then advance the schedule.
 */
export async function fireDueSchedule(schedule: Schedule, now: Date = new Date()): Promise<{ fired: boolean; reason?: string }> {
  const db = await dbi();
  const { subjects, prompts } = await import("@/lib/db/schema");
  const { getUserSettings } = await import("@/lib/core/keys");
  const { estimateAuditCost } = await import("@/lib/engines/pricing");
  const { runAudit } = await import("@/lib/core/audit");

  const [subject] = await db.select().from(subjects).where(eq(subjects.id, schedule.subjectId)).limit(1);
  if (!subject) return { fired: false, reason: "subject missing" };

  const enabled = await db
    .select({ id: prompts.id })
    .from(prompts)
    .where(and(eq(prompts.subjectId, schedule.subjectId), eq(prompts.enabled, true)));
  if (enabled.length === 0) {
    await advanceSchedule(schedule.id, schedule.cadence, { skipReason: "no enabled prompts", at: now });
    return { fired: false, reason: "no enabled prompts" };
  }

  const settings = await getUserSettings(subject.userId);
  const estimate = estimateAuditCost(enabled.length, schedule.engines, schedule.samples);
  const spent = await monthlySpendForUser(subject.userId);
  const decision = capDecision(estimate, spent, { perRun: settings.maxSpendPerRunUsd, monthly: settings.maxSpendMonthlyUsd });
  if (!decision.allowed) {
    await advanceSchedule(schedule.id, schedule.cadence, { skipReason: decision.reason!, at: now });
    return { fired: false, reason: decision.reason };
  }

  await runAudit(
    schedule.subjectId,
    { engines: schedule.engines, samples: schedule.samples, temperature: settings.temperature, maxSpendUsd: settings.maxSpendPerRunUsd },
    { scheduleId: schedule.id },
  );
  await advanceSchedule(schedule.id, schedule.cadence, { ranAt: now });
  return { fired: true };
}


export async function findDueSchedules(now: Date): Promise<Schedule[]> {
  const db = await dbi();
  const { schedules } = await import("@/lib/db/schema");
  const all = await db.select().from(schedules).where(eq(schedules.enabled, true));
  return selectDueSchedules(all, now);
}

/** Advance a schedule after a run fired (or was skipped). Idempotent per cadence. */
export async function advanceSchedule(
  scheduleId: string,
  cadence: Cadence,
  result: { ranAt: Date } | { skipReason: string; at: Date },
): Promise<void> {
  const db = await dbi();
  const { schedules } = await import("@/lib/db/schema");
  const base = "ranAt" in result ? result.ranAt : result.at;
  const next = nextRunFrom(cadence, base);
  if ("ranAt" in result) {
    await db
      .update(schedules)
      .set({ nextRunAt: next, lastRunAt: result.ranAt, lastSkipReason: null, lastSkipAt: null, updatedAt: result.ranAt })
      .where(eq(schedules.id, scheduleId));
  } else {
    await db
      .update(schedules)
      .set({ nextRunAt: next, lastSkipReason: result.skipReason, lastSkipAt: result.at, updatedAt: result.at })
      .where(eq(schedules.id, scheduleId));
  }
}
