import { desc, eq } from "drizzle-orm";
import type { SiteAuditArea, SiteAuditFinding } from "@/lib/db/schema";
import type { CoverageGap, SourceDomain } from "@/lib/core/sources";

/**
 * Recommended actions = M4 coverage gaps + M5 site findings, mapped to the four
 * buckets (Create / Improve / Earn / Engage), ranked, and ALWAYS backed by
 * concrete evidence (prompts/sources/findings) so no action is a black box.
 * `buildOpportunities` is PURE → eval-tested.
 */

export type OpportunityKind = "create" | "improve" | "earn" | "engage";
export type Impact = "high" | "med" | "low";
export type Effort = "low" | "med" | "high";

export type Opportunity = {
  id: string;
  kind: OpportunityKind;
  title: string;
  rationale: string;
  evidence: { prompts?: string[]; sources?: string[]; findings?: string[] };
  targetTopic?: string;
  impact: Impact;
  effort: Effort;
};

export type OpportunityInput = {
  coverageGaps: CoverageGap[];
  topDomains: SourceDomain[];
  findings: SiteAuditFinding[];
  /** topic -> does the site already cover it (drives Create vs Improve). */
  topicCoverage: Record<string, boolean>;
  hasSiteAudit: boolean;
};

// Known user-generated-content domains → "engage" rather than "earn".
const UGC_DOMAINS = [
  "reddit.com",
  "youtube.com",
  "quora.com",
  "stackoverflow.com",
  "stackexchange.com",
  "news.ycombinator.com",
  "medium.com",
  "substack.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "linkedin.com",
];

function isUgc(domain: string): boolean {
  return UGC_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

const impactRank: Record<Impact, number> = { high: 3, med: 2, low: 1 };
const effortRank: Record<Effort, number> = { low: 3, med: 2, high: 1 };

/**
 * Is a prompt's topic covered by the site? topicCoverage is keyed by exact
 * subject-topic strings, but a model-generated prompt's topic may differ in
 * case/phrasing (e.g. "AEO" vs "answer engine optimization"). Match leniently
 * (exact → case-insensitive → substring either way) before defaulting to Create.
 */
function isTopicCovered(topic: string | undefined, coverage: Record<string, boolean>): boolean {
  if (!topic) return false;
  if (coverage[topic] === true) return true;
  const t = topic.trim().toLowerCase();
  if (!t) return false;
  for (const [key, covered] of Object.entries(coverage)) {
    if (!covered) continue;
    const k = key.trim().toLowerCase();
    if (k === t || k.includes(t) || t.includes(k)) return true;
  }
  return false;
}

export function buildOpportunities(input: OpportunityInput): Opportunity[] {
  const out: Opportunity[] = [];
  const { coverageGaps, topDomains, findings, topicCoverage } = input;

  // ── Create / Improve from coverage gaps ────────────────────────────────────
  for (const gap of coverageGaps) {
    const topic = gap.topic ?? undefined;
    // If the site covers the topic, you have a page → IMPROVE it; else CREATE.
    const covered = isTopicCovered(topic, topicCoverage);
    const competing = gap.competingDomains.length;
    const impact: Impact = competing >= 3 ? "high" : competing >= 1 ? "med" : "low";

    if (covered) {
      out.push({
        id: `improve-${gap.promptId}`,
        kind: "improve",
        title: `Upgrade your ${topic} page so AI cites you for "${truncate(gap.promptText, 60)}"`,
        rationale: `AI cites ${gap.competingDomains.join(", ") || "third parties"} for this query — you have content on "${topic}" but aren't being cited. Strengthen it (add schema, an answer-first intro, and an FAQ).`,
        evidence: { prompts: [gap.promptText], sources: gap.competingDomains },
        targetTopic: topic,
        impact,
        effort: "med",
      });
    } else {
      out.push({
        id: `create-${gap.promptId}`,
        kind: "create",
        title: `Publish content answering "${truncate(gap.promptText, 60)}"`,
        rationale: `AI answers this with ${gap.competingDomains.join(", ") || "third-party sources"} and never mentions you, and you have no page on ${topic ? `"${topic}"` : "this topic"}. Write a focused, citable page targeting this query.`,
        evidence: { prompts: [gap.promptText], sources: gap.competingDomains },
        targetTopic: topic,
        impact,
        effort: "med",
      });
    }
  }

  // ── Improve from on-site findings (schema / structure weaknesses) ───────────
  const improvableAreas: SiteAuditArea[] = ["schema", "structure", "fetchability"];
  for (const f of findings) {
    if (!improvableAreas.includes(f.area)) continue;
    if (f.severity === "low") continue; // keep the action list high-signal
    out.push({
      id: `improve-finding-${f.id}`,
      kind: "improve",
      title: f.message.replace(/\.$/, ""),
      rationale: f.evidence ?? "A site-audit finding that hurts how AI reads and cites you.",
      evidence: { findings: [f.message] },
      impact: f.severity === "high" ? "high" : "med",
      effort: f.area === "schema" || f.area === "structure" ? "low" : "med",
    });
  }

  // ── Earn / Engage from repeatedly-cited third-party domains ─────────────────
  const thirdParty = topDomains.filter((d) => !d.isYours).slice(0, 12);
  for (const d of thirdParty) {
    if (d.prompts < 1) continue;
    const strong = d.count >= 3 || d.prompts >= 2;
    if (isUgc(d.domain)) {
      out.push({
        id: `engage-${d.domain}`,
        kind: "engage",
        title: `Engage on ${d.domain}`,
        rationale: `${d.domain} is cited ${d.count}× across ${d.prompts} of your prompts. Authentically participate in the relevant threads/videos so your perspective is part of what AI reads. (Advisory — Limelight never posts for you.)`,
        evidence: { sources: [d.domain] },
        impact: strong ? "med" : "low",
        effort: "med",
      });
    } else {
      out.push({
        id: `earn-${d.domain}`,
        kind: "earn",
        title: `Earn a mention on ${d.domain}`,
        rationale: `${d.domain} is repeatedly cited (${d.count}× across ${d.prompts} prompts) for your topics. A feature, guest post, or listing there could get you cited too. (Advisory — outreach is up to you.)`,
        evidence: { sources: [d.domain] },
        impact: strong ? "high" : "med",
        effort: "high",
      });
    }
  }

  // Dedupe by stable id (unique per source) — NOT by title, which can collide
  // across distinct prompts/findings and silently drop their evidence.
  const seen = new Set<string>();
  const deduped = out.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  deduped.sort(
    (a, b) => impactRank[b.impact] - impactRank[a.impact] || effortRank[b.effort] - effortRank[a.effort],
  );
  return deduped;
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

// ── DB wrapper ──────────────────────────────────────────────────────────────

/**
 * Combine the latest audit run's coverage gaps/sources with the latest site
 * audit's findings into ranked opportunities. Either input may be absent (e.g.
 * no site audit yet) — we still produce content gaps from the run.
 */
export async function findContentGaps(
  auditRunId?: string,
  siteAuditId?: string,
): Promise<Opportunity[]> {
  const { db } = await import("@/lib/db/client");
  const { auditRuns, siteAudits, subjects } = await import("@/lib/db/schema");
  const { analyzeSources } = await import("@/lib/core/sources");

  const runId = auditRunId;
  let subjectId: string | null = null;

  if (runId) {
    const [run] = await db.select().from(auditRuns).where(eq(auditRuns.id, runId)).limit(1);
    if (run) subjectId = run.subjectId;
  }

  let coverageGaps: CoverageGap[] = [];
  let topDomains: SourceDomain[] = [];
  if (runId) {
    const sources = await analyzeSources(runId);
    if (sources) {
      coverageGaps = sources.coverageGaps;
      topDomains = sources.topDomains;
    }
  }

  // Site audit: explicit id, else latest for the subject.
  let findings: SiteAuditFinding[] = [];
  let topicCoverage: Record<string, boolean> = {};
  let hasSiteAudit = false;
  let siteAudit;
  if (siteAuditId) {
    [siteAudit] = await db.select().from(siteAudits).where(eq(siteAudits.id, siteAuditId)).limit(1);
  } else if (subjectId) {
    [siteAudit] = await db
      .select()
      .from(siteAudits)
      .where(eq(siteAudits.subjectId, subjectId))
      .orderBy(desc(siteAudits.crawledAt))
      .limit(1);
  }
  if (siteAudit) {
    findings = siteAudit.findings;
    topicCoverage = siteAudit.topicCoverage;
    hasSiteAudit = true;
    if (!subjectId) subjectId = siteAudit.subjectId;
  }

  // Backfill topicCoverage keys for subject topics not in the map (treated as uncovered).
  if (subjectId) {
    const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
    if (subject) {
      for (const t of subject.topics) if (!(t in topicCoverage)) topicCoverage[t] = false;
    }
  }

  return buildOpportunities({ coverageGaps, topDomains, findings, topicCoverage, hasSiteAudit });
}
