import { and, eq, inArray } from "drizzle-orm";
import {
  auditRuns,
  citations as citationsT,
  mentions as mentionsT,
  modelResponses,
  prompts as promptsT,
  subjects as subjectsT,
  type EngineId,
} from "@/lib/db/schema";
import { normalizeDomain } from "@/lib/engines/types";

export type SourceDomain = {
  domain: string;
  count: number;
  prompts: number;
  engines: EngineId[];
  isYours: boolean;
};

export type SourceUrl = {
  url: string;
  domain: string;
  title: string | null;
  count: number;
  prompts: number;
  engines: EngineId[];
  isYours: boolean;
};

export type CoverageGap = {
  promptId: string;
  promptText: string;
  topic: string | null;
  competingDomains: string[];
};

export type PerEngineSources = { engine: EngineId; topDomains: { domain: string; count: number }[] };

export type SourceAnalysis = {
  hasSearchEnabledCitations: boolean;
  subjectDomain: string | null;
  topDomains: SourceDomain[];
  topUrls: SourceUrl[];
  coverageGaps: CoverageGap[];
  perEngine: PerEngineSources[];
};

export type SourceAggInput = {
  subjectDomain: string | null;
  responses: { id: string; engine: EngineId; promptId: string; searchEnabled: boolean }[];
  citations: { modelResponseId: string; url: string; domain: string; title: string | null }[];
  /** responseId -> whether the subject was mentioned in that response. */
  subjectMentionByResponse: Record<string, boolean>;
  prompts: { id: string; text: string; topic: string | null }[];
};

const TOP_N = 25;

/**
 * Pure aggregation of cited sources. Only citations from `searchEnabled`
 * responses count (a non-grounded engine cannot inject fake sources). Pure +
 * deterministic so it's eval-tested for free.
 */
export function aggregateSources(input: SourceAggInput): SourceAnalysis {
  const { subjectDomain } = input;
  const respById = new Map(input.responses.map((r) => [r.id, r]));
  const promptById = new Map(input.prompts.map((p) => [p.id, p]));

  // Gate: keep only citations from searchEnabled responses.
  const cites = input.citations.filter((c) => respById.get(c.modelResponseId)?.searchEnabled);

  type Agg = { count: number; prompts: Set<string>; engines: Set<EngineId> };
  const domainAgg = new Map<string, Agg>();
  const urlAgg = new Map<string, Agg & { title: string | null; domain: string }>();
  const perEngineDomain = new Map<EngineId, Map<string, number>>();

  for (const c of cites) {
    const resp = respById.get(c.modelResponseId)!;
    const domain = (normalizeDomain(c.url) ?? c.domain).toLowerCase();

    const d = domainAgg.get(domain) ?? { count: 0, prompts: new Set(), engines: new Set() };
    d.count += 1;
    d.prompts.add(resp.promptId);
    d.engines.add(resp.engine);
    domainAgg.set(domain, d);

    const u =
      urlAgg.get(c.url) ?? { count: 0, prompts: new Set(), engines: new Set(), title: c.title, domain };
    u.count += 1;
    u.prompts.add(resp.promptId);
    u.engines.add(resp.engine);
    urlAgg.set(c.url, u);

    const pe = perEngineDomain.get(resp.engine) ?? new Map<string, number>();
    pe.set(domain, (pe.get(domain) ?? 0) + 1);
    perEngineDomain.set(resp.engine, pe);
  }

  const topDomains: SourceDomain[] = [...domainAgg.entries()]
    .map(([domain, a]) => ({
      domain,
      count: a.count,
      prompts: a.prompts.size,
      engines: [...a.engines],
      isYours: subjectDomain != null && domain === subjectDomain,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  const topUrls: SourceUrl[] = [...urlAgg.entries()]
    .map(([url, a]) => ({
      url,
      domain: a.domain,
      title: a.title,
      count: a.count,
      prompts: a.prompts.size,
      engines: [...a.engines],
      isYours: subjectDomain != null && a.domain === subjectDomain,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_N);

  const perEngine: PerEngineSources[] = [...perEngineDomain.entries()].map(([engine, m]) => ({
    engine,
    topDomains: [...m.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
  }));

  // Coverage gaps: prompts where third-party sources are cited but the subject
  // is neither mentioned nor cited — places you could be earning citations.
  const byPrompt = new Map<string, { thirdParty: Map<string, number>; subjectCited: boolean; subjectMentioned: boolean }>();
  for (const resp of input.responses) {
    if (!resp.searchEnabled) continue;
    const entry =
      byPrompt.get(resp.promptId) ?? { thirdParty: new Map(), subjectCited: false, subjectMentioned: false };
    if (input.subjectMentionByResponse[resp.id]) entry.subjectMentioned = true;
    byPrompt.set(resp.promptId, entry);
  }
  for (const c of cites) {
    const resp = respById.get(c.modelResponseId)!;
    const entry = byPrompt.get(resp.promptId);
    if (!entry) continue;
    const domain = (normalizeDomain(c.url) ?? c.domain).toLowerCase();
    if (subjectDomain != null && domain === subjectDomain) entry.subjectCited = true;
    else entry.thirdParty.set(domain, (entry.thirdParty.get(domain) ?? 0) + 1);
  }

  const coverageGaps: CoverageGap[] = [];
  for (const [promptId, entry] of byPrompt) {
    if (entry.subjectMentioned || entry.subjectCited) continue;
    if (entry.thirdParty.size === 0) continue;
    const p = promptById.get(promptId);
    coverageGaps.push({
      promptId,
      promptText: p?.text ?? "",
      topic: p?.topic ?? null,
      competingDomains: [...entry.thirdParty.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([d]) => d),
    });
  }

  return {
    hasSearchEnabledCitations: cites.length > 0,
    subjectDomain,
    topDomains,
    topUrls,
    coverageGaps,
    perEngine,
  };
}

/** DB wrapper: load a run's responses/citations/mentions and aggregate. */
export async function analyzeSources(auditRunId: string): Promise<SourceAnalysis | null> {
  // Lazy import so the pure aggregateSources() stays testable without DATABASE_URL.
  const { db } = await import("@/lib/db/client");
  const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, auditRunId)).limit(1);
  if (!run) return null;
  const [subject] = await db.select().from(subjectsT).where(eq(subjectsT.id, run.subjectId)).limit(1);
  const subjectDomain = subject?.siteUrl ? normalizeDomain(subject.siteUrl) : null;

  const responses = await db
    .select({
      id: modelResponses.id,
      engine: modelResponses.engine,
      promptId: modelResponses.promptId,
      searchEnabled: modelResponses.searchEnabled,
    })
    .from(modelResponses)
    .where(eq(modelResponses.auditRunId, auditRunId));

  const respIds = responses.map((r) => r.id);
  const cites = respIds.length
    ? await db
        .select({
          modelResponseId: citationsT.modelResponseId,
          url: citationsT.url,
          domain: citationsT.domain,
          title: citationsT.title,
        })
        .from(citationsT)
        .where(inArray(citationsT.modelResponseId, respIds))
    : [];
  const subjMentions = respIds.length
    ? await db
        .select({ modelResponseId: mentionsT.modelResponseId, mentioned: mentionsT.mentioned })
        .from(mentionsT)
        .where(and(inArray(mentionsT.modelResponseId, respIds), eq(mentionsT.targetType, "subject")))
    : [];
  const subjectMentionByResponse: Record<string, boolean> = {};
  for (const m of subjMentions) subjectMentionByResponse[m.modelResponseId] = m.mentioned;

  const prompts = await db
    .select({ id: promptsT.id, text: promptsT.text, topic: promptsT.topic })
    .from(promptsT)
    .where(eq(promptsT.subjectId, run.subjectId));

  return aggregateSources({ subjectDomain, responses, citations: cites, subjectMentionByResponse, prompts });
}
