import type { AuditScores } from "@/lib/db/schema";

/**
 * In-app assistant (M8) — RAG over the user's OWN Limelight data. NOT an MCP
 * server and NOT an agent with write access: it is read-only and answers strictly
 * from retrieved data, cites that data, and declines when the data doesn't support
 * an answer. If the user asks it to DO something effectful (export / schedule /
 * email / draft), it returns a PROPOSAL that routes to the existing confirm-gated
 * UI — it never executes the effect itself.
 *
 * The pure pieces (detectActionIntent / buildKeylessAnswer / dataCitations) are
 * eval-tested; askAssistant() gathers data and calls them + the model.
 */

export type DataCitationKind = "run" | "sources" | "gap" | "site_audit" | "draft" | "page";
export type DataCitation = { kind: DataCitationKind; label: string; href: string };

export type ProposedActionKind = "export" | "schedule" | "email" | "draft";
export type ProposedAction = { kind: ProposedActionKind; label: string; href: string };

export type AssistantAnswer = {
  answer: string;
  citations: DataCitation[];
  /** A confirm-gated action to route to — the assistant never executes it. */
  proposedAction: ProposedAction | null;
  /** False when we had no data to ground an answer (we decline rather than invent). */
  grounded: boolean;
  source: "model" | "keyless";
};

export type AssistantData = {
  subjectName: string;
  latestRun: { id: string; createdAt: Date; scores: AuditScores | null } | null;
  weakPrompts: string[];
  topDomains: { domain: string; isYours: boolean; count: number }[];
  coverageGaps: { promptText: string; competingDomains: string[] }[];
  siteFindings: { message: string; severity: string }[];
  draftTitles: string[];
  opportunities: { title: string; kind: string }[];
  changed: { visibilityDelta: number | null; gained: string[]; lost: string[]; comparable: boolean } | null;
  retrieved: { url: string; content: string }[];
};

// ── Action-intent detection (route to confirm UI; NEVER execute) ─────────────

export function detectActionIntent(question: string): ProposedAction | null {
  const q = question.toLowerCase();
  if (/\b(export|download|save as|markdown|html|json-?ld)\b/.test(q) && !/how (do|to)/.test(q))
    return { kind: "export", label: "Export a draft", href: "/app/content" };
  if (/\b(schedule|track over time|weekly|recurring|automate)\b/.test(q))
    return { kind: "schedule", label: "Set up tracking", href: "/app/tracking" };
  if (/\b(email|digest|notify|send me)\b/.test(q))
    return { kind: "email", label: "Configure the weekly digest", href: "/app/tracking" };
  if (/\b(draft|write|create) (content|an article|a page|a post|something)\b|draft content/.test(q))
    return { kind: "draft", label: "Draft content from an opportunity", href: "/app/actions" };
  return null;
}

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

// ── Data citations (deterministic — we only cite blocks we actually have) ────

export function dataCitations(data: AssistantData): DataCitation[] {
  const cites: DataCitation[] = [];
  if (data.latestRun) cites.push({ kind: "run", label: "Your last audit", href: "/app/visibility" });
  if (data.topDomains.length || data.coverageGaps.length) cites.push({ kind: "sources", label: "Your sources", href: "/app/sources" });
  if (data.siteFindings.length) cites.push({ kind: "site_audit", label: "Your site audit", href: "/app/site-audit" });
  if (data.opportunities.length) cites.push({ kind: "gap", label: "Your actions", href: "/app/actions" });
  if (data.draftTitles.length) cites.push({ kind: "draft", label: "Your drafts", href: "/app/content" });
  return cites;
}

export function hasAnyData(data: AssistantData): boolean {
  return Boolean(
    data.latestRun ||
      data.topDomains.length ||
      data.coverageGaps.length ||
      data.siteFindings.length ||
      data.draftTitles.length ||
      data.opportunities.length ||
      data.retrieved.length,
  );
}

// ── Keyless deterministic answer (no model — never fabricates) ───────────────

const DECLINE =
  "I can only answer from your Limelight data — your audits, sources, coverage gaps, site findings, and what changed between runs. I don't have data to answer that. Try asking what you're losing on, what changed since last run, or to summarize your visibility.";

export function buildKeylessAnswer(question: string, data: AssistantData): string {
  const q = question.toLowerCase();

  if (/\b(losing|weak|not mentioned|missing|absent|gaps?)\b/.test(q)) {
    if (data.coverageGaps.length === 0 && data.weakPrompts.length === 0) {
      return "Based on your last audit, I don't see clear gaps — you're mentioned where AI is answering, or there isn't enough cited data yet.";
    }
    const lines = data.coverageGaps.slice(0, 5).map((g) => `• "${g.promptText}" — AI cites ${g.competingDomains.join(", ") || "third parties"}, not you.`);
    const extra = data.weakPrompts.slice(0, 3).filter((p) => !data.coverageGaps.some((g) => g.promptText === p));
    return [`You're losing visibility on ${data.coverageGaps.length} prompt${data.coverageGaps.length === 1 ? "" : "s"} (based on your last audit):`, ...lines, ...extra.map((p) => `• "${p}" — not mentioned.`)].join("\n");
  }

  if (/\bchang|since last|compare|movement|trend\b/.test(q)) {
    if (!data.changed) return "I need at least two completed audits to tell you what changed. Run another audit (or enable scheduled tracking).";
    if (!data.changed.comparable) return "Your last two runs used a different engine/sample config, so the numbers aren't directly comparable. Re-run with the same config to see real movement.";
    const parts = [`Since your previous run, visibility ${data.changed.visibilityDelta != null && data.changed.visibilityDelta >= 0 ? "rose" : "fell"} ${Math.abs(Math.round((data.changed.visibilityDelta ?? 0) * 100))} pts.`];
    if (data.changed.gained.length) parts.push(`Newly mentioned: ${data.changed.gained.slice(0, 4).join("; ")}.`);
    if (data.changed.lost.length) parts.push(`Lost mentions: ${data.changed.lost.slice(0, 4).join("; ")}.`);
    return parts.join(" ");
  }

  if (/\bsource|cited|who gets cited|domains?\b/.test(q)) {
    if (data.topDomains.length === 0) return "Your last audit didn't return search-grounded citations yet, so I can't show top sources.";
    const top = data.topDomains.slice(0, 5).map((d) => `${d.domain}${d.isYours ? " (yours)" : ""} ×${d.count}`).join(", ");
    return `For your topics, AI most often cites: ${top}.${data.coverageGaps.length ? ` You're absent on ${data.coverageGaps.length} cited prompt${data.coverageGaps.length === 1 ? "" : "s"}.` : ""}`;
  }

  if (/\b(summar|visib|overall|how am i|doing|score)/.test(q)) {
    if (!data.latestRun?.scores) return "You don't have a completed audit yet. Run one from the Overview to see your visibility.";
    const s = data.latestRun.scores;
    return `Based on your last audit: visibility ${pct(s.visibilityScore)} (mentioned in ${s.promptsMentionedCount} of ${s.promptCount} prompts)${s.shareOfVoice != null ? `, share of voice ${pct(s.shareOfVoice)}` : ""}${s.avgPosition != null ? `, average position ${s.avgPosition.toFixed(1)}` : ""}.`;
  }

  if (/\b(draft|write|create) /.test(q)) {
    if (data.opportunities.length === 0) return "I don't see a Create/Improve opportunity to draft from yet. Run an audit and a site audit, then I can point you to one.";
    return `I can't write it here, but your top opportunity is "${data.opportunities[0].title}". Open it in Actions and click "Draft content" — you'll confirm before anything is generated or exported.`;
  }

  return DECLINE;
}

// ── Model prompt ──────────────────────────────────────────────────────────

function buildContextText(data: AssistantData): string {
  const blocks: string[] = [];
  if (data.latestRun?.scores) {
    const s = data.latestRun.scores;
    blocks.push(
      `[LAST AUDIT ${data.latestRun.createdAt.toISOString().slice(0, 10)}] visibility=${pct(s.visibilityScore)} mentionedPrompts=${s.promptsMentionedCount}/${s.promptCount} shareOfVoice=${pct(s.shareOfVoice)} avgPosition=${s.avgPosition ?? "n/a"} citationFreq=${pct(s.citationFrequency)}`,
    );
  }
  if (data.weakPrompts.length) blocks.push(`[NOT MENTIONED ON] ${data.weakPrompts.slice(0, 12).map((p) => `"${p}"`).join("; ")}`);
  if (data.coverageGaps.length) blocks.push(`[COVERAGE GAPS] ${data.coverageGaps.slice(0, 8).map((g) => `"${g.promptText}" -> cited: ${g.competingDomains.join(", ")}`).join(" | ")}`);
  if (data.topDomains.length) blocks.push(`[TOP CITED DOMAINS] ${data.topDomains.slice(0, 10).map((d) => `${d.domain}${d.isYours ? "(yours)" : ""} x${d.count}`).join(", ")}`);
  if (data.siteFindings.length) blocks.push(`[SITE AUDIT FINDINGS] ${data.siteFindings.slice(0, 8).map((f) => `(${f.severity}) ${f.message}`).join(" | ")}`);
  if (data.opportunities.length) blocks.push(`[RECOMMENDED ACTIONS] ${data.opportunities.slice(0, 8).map((o) => `[${o.kind}] ${o.title}`).join(" | ")}`);
  if (data.draftTitles.length) blocks.push(`[CONTENT DRAFTS] ${data.draftTitles.slice(0, 8).join("; ")}`);
  if (data.changed) blocks.push(`[CHANGED SINCE PREV RUN] comparable=${data.changed.comparable} visibilityDelta=${data.changed.visibilityDelta ?? "n/a"} gained=${data.changed.gained.slice(0, 5).join("; ") || "none"} lost=${data.changed.lost.slice(0, 5).join("; ") || "none"}`);
  if (data.retrieved.length) blocks.push(`[RETRIEVED PAGE EXCERPTS]\n${data.retrieved.slice(0, 4).map((r) => `- ${r.url}: ${r.content.slice(0, 300)}`).join("\n")}`);
  return blocks.join("\n");
}

function buildSystemPrompt(): string {
  return [
    "You are Limelight's assistant. Answer the user's question ONLY using the DATA block below about THEIR OWN AI-visibility (their audits, sources, gaps, site findings, drafts).",
    "Cite the data you used in plain language (e.g. \"based on your last audit, you're not mentioned for '<prompt>'\").",
    "If the DATA does not contain the answer, say you don't have that information. NEVER invent facts, numbers, sources, or claims about the user or the outside world — grounding in their data is the whole point.",
    "You are READ-ONLY. You cannot run audits, export, schedule, email, or publish. If the user asks you to DO something, briefly say how (which screen) and that they'll confirm there — the app will show the action button. Do not claim you performed it.",
    "Be concise and concrete.",
  ].join("\n");
}

// ── The verb (DB + model orchestration) ──────────────────────────────────────

export async function gatherAssistantData(subjectId: string, question: string): Promise<AssistantData> {
  const { db } = await import("@/lib/db/client");
  const { eq, desc, and, inArray } = await import("drizzle-orm");
  const { subjects, auditRuns, prompts, modelResponses, mentions, contentDrafts } = await import("@/lib/db/schema");
  const { analyzeSources } = await import("@/lib/core/sources");
  const { getLatestSiteAudit } = await import("@/lib/core/site-audit");
  const { getOpportunitiesForSubject } = await import("@/lib/core/content-context");
  const { getDiffData } = await import("@/lib/core/tracking");
  const { retrieveChunks } = await import("@/lib/core/embeddings");
  const { getProviderKey } = await import("@/lib/core/keys");

  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  const subjectName = subject?.name ?? "you";

  const [latestRun] = await db
    .select({ id: auditRuns.id, createdAt: auditRuns.createdAt, scores: auditRuns.scores })
    .from(auditRuns)
    .where(and(eq(auditRuns.subjectId, subjectId), eq(auditRuns.status, "complete")))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);

  // Weak prompts: enabled prompts not mentioned in the latest run.
  let weakPrompts: string[] = [];
  if (latestRun) {
    const responses = await db
      .select({ id: modelResponses.id, promptId: modelResponses.promptId })
      .from(modelResponses)
      .where(eq(modelResponses.auditRunId, latestRun.id));
    const respIds = responses.map((r) => r.id);
    const mens = respIds.length
      ? await db.select({ modelResponseId: mentions.modelResponseId, mentioned: mentions.mentioned }).from(mentions).where(and(inArray(mentions.modelResponseId, respIds), eq(mentions.targetType, "subject")))
      : [];
    const mentionedResp = new Set(mens.filter((m) => m.mentioned).map((m) => m.modelResponseId));
    const mentionedPrompts = new Set(responses.filter((r) => mentionedResp.has(r.id)).map((r) => r.promptId));
    const promptRows = await db.select({ id: prompts.id, text: prompts.text }).from(prompts).where(and(eq(prompts.subjectId, subjectId), eq(prompts.enabled, true)));
    weakPrompts = promptRows.filter((p) => !mentionedPrompts.has(p.id)).map((p) => p.text);
  }

  const sources = latestRun ? await analyzeSources(latestRun.id).catch(() => null) : null;
  const siteAudit = await getLatestSiteAudit(subjectId).catch(() => null);
  const opportunities = await getOpportunitiesForSubject(subjectId).catch(() => []);
  const drafts = await db.select({ title: contentDrafts.title }).from(contentDrafts).where(eq(contentDrafts.subjectId, subjectId)).orderBy(desc(contentDrafts.updatedAt)).limit(10);
  const diff = await getDiffData(subjectId).catch(() => null);
  const openaiKey = subject ? await getProviderKey(subject.userId, "openai").catch(() => null) : null;
  const retrieved = await retrieveChunks(subjectId, question, { k: 4, apiKey: openaiKey }).catch(() => []);

  return {
    subjectName,
    latestRun: latestRun ?? null,
    weakPrompts,
    topDomains: (sources?.topDomains ?? []).map((d) => ({ domain: d.domain, isYours: d.isYours, count: d.count })),
    coverageGaps: (sources?.coverageGaps ?? []).map((g) => ({ promptText: g.promptText, competingDomains: g.competingDomains })),
    siteFindings: (siteAudit?.findings ?? []).map((f) => ({ message: f.message, severity: f.severity })),
    draftTitles: drafts.map((d) => d.title),
    opportunities: opportunities.map((o) => ({ title: o.title, kind: o.kind })),
    changed: diff ? { visibilityDelta: diff.visibilityDelta, gained: diff.gainedMentions.map((m) => m.text), lost: diff.lostMentions.map((m) => m.text), comparable: !diff.configMismatch } : null,
    retrieved: retrieved.map((r) => ({ url: r.url, content: r.content })),
  };
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function askAssistant(subjectId: string, question: string, history: ChatTurn[] = []): Promise<AssistantAnswer> {
  const data = await gatherAssistantData(subjectId, question);
  const citations = dataCitations(data);
  const proposedAction = detectActionIntent(question);

  if (!hasAnyData(data)) {
    return {
      answer: "I don't have any data about you yet. Run an audit from the Overview (and optionally a site audit) — then I can answer questions about your visibility, sources, and what to do next.",
      citations: [],
      proposedAction,
      grounded: false,
      source: "keyless",
    };
  }

  const { generateText, hasGenerationKey } = await import("@/lib/generation/client");
  if (!hasGenerationKey()) {
    return { answer: buildKeylessAnswer(question, data), citations, proposedAction, grounded: true, source: "keyless" };
  }

  const historyText = history.slice(-6).map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.content}`).join("\n");
  const prompt = [
    "DATA:",
    buildContextText(data),
    "",
    historyText ? `CONVERSATION SO FAR:\n${historyText}\n` : "",
    `QUESTION: ${question}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const answer = await generateText({ system: buildSystemPrompt(), prompt, maxTokens: 900 });
    return { answer: answer.trim() || buildKeylessAnswer(question, data), citations, proposedAction, grounded: true, source: "model" };
  } catch {
    // Model error → deterministic grounded fallback, never fabricate or throw.
    return { answer: buildKeylessAnswer(question, data), citations, proposedAction, grounded: true, source: "keyless" };
  }
}
