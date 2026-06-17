import { desc, eq } from "drizzle-orm";
import {
  siteAudits,
  type SiteAudit,
  type SiteAuditArea,
  type SiteAuditFinding,
} from "@/lib/db/schema";
import type { PageData } from "@/lib/crawl/parse";
import type { CrawlResult } from "@/lib/crawl/crawler";

/**
 * AI-readiness scoring. Each category yields a 0..1 sub-score; the weighted sum
 * is the 0–100 readiness score. Findings are specific + fixable (never "improve
 * your SEO"). PURE → eval-tested against parsed HTML fixtures, no network.
 */

export type ReadinessSubject = { name: string; aliases?: string[]; topics: string[] };

export type ReadinessInput = {
  pages: PageData[];
  robotsFetched: boolean;
  aiCrawlersBlocked: string[];
  hasSitemap: boolean;
  subject: ReadinessSubject;
};

export type ReadinessResult = {
  aiReadinessScore: number;
  findings: SiteAuditFinding[];
  readable: boolean;
  topicCoverage: Record<string, boolean>;
  categoryScores: Record<SiteAuditArea, number>;
};

const WEIGHTS: Record<SiteAuditArea, number> = {
  schema: 25,
  structure: 25,
  fetchability: 25,
  entity: 15,
  topics: 10,
};

const ENTITY_SCHEMA_TYPES = /^(person|organization|localbusiness|product|article|website|profilepage)$/i;

function hasType(pages: PageData[], re: RegExp): boolean {
  return pages.some((p) => p.jsonLd.some((b) => b.valid && b.types.some((t) => re.test(t))));
}

function pagesWithText(pages: PageData[]): PageData[] {
  return pages.filter((p) => !p.looksClientRendered && p.textLength >= 400);
}

/** Coarse topic coverage: does any readable page mention the topic in text/headings? */
export function computeTopicCoverage(pages: PageData[], topics: string[]): Record<string, boolean> {
  const readable = pagesWithText(pages);
  const haystack = readable
    .map((p) => `${p.title ?? ""} ${p.headings.map((h) => h.text).join(" ")} ${p.bodyText}`.toLowerCase())
    .join(" \n ");
  const out: Record<string, boolean> = {};
  for (const topic of topics) {
    const t = topic.trim().toLowerCase();
    out[topic] = t.length > 0 && haystack.includes(t);
  }
  return out;
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const { pages, subject } = input;
  const findings: SiteAuditFinding[] = [];
  const readablePages = pagesWithText(pages);
  const readable = readablePages.length > 0;

  // Honest gate: if nothing was readable, report it loudly and score low.
  if (pages.length === 0) {
    findings.push({
      id: "no-pages",
      severity: "high",
      area: "fetchability",
      message: "We couldn't fetch any pages from your site.",
      evidence: "No HTML responded — check the site URL, that the site is up, and that it isn't blocking crawlers.",
    });
  } else if (!readable) {
    findings.push({
      id: "client-rendered",
      severity: "high",
      area: "fetchability",
      message: "Your site appears client-rendered (JavaScript-only) — AI crawlers may see an empty page.",
      evidence:
        "We fetched pages but found almost no server-rendered text. AI assistants that don't run JS will read nothing. Server-render or pre-render your key pages.",
      pages: pages.slice(0, 5).map((p) => p.url),
    });
  }

  // ── schema (25) ──────────────────────────────────────────────────────────
  let schema = 0;
  const anyJsonLd = pages.some((p) => p.jsonLd.length > 0);
  const anyValid = pages.some((p) => p.jsonLd.some((b) => b.valid));
  const hasEntity = hasType(pages, ENTITY_SCHEMA_TYPES);
  const hasFaqSchema = hasType(pages, /faqpage|qapage/i);
  if (!anyJsonLd) {
    findings.push({
      id: "no-schema",
      severity: "high",
      area: "schema",
      message: "No structured data (JSON-LD) found.",
      evidence: "Add JSON-LD (Person/Organization/Product, plus FAQPage). It's the clearest signal AI uses to identify and cite you.",
    });
  } else if (!anyValid) {
    schema = 0.2;
    findings.push({
      id: "invalid-schema",
      severity: "high",
      area: "schema",
      message: "JSON-LD is present but doesn't parse or has no @type.",
      evidence: "Invalid schema is worse than none. Validate it (we deepen this check in the content tools).",
    });
  } else {
    schema = 0.6;
    if (hasEntity) schema += 0.25;
    else
      findings.push({
        id: "no-entity-schema",
        severity: "med",
        area: "schema",
        message: "Add an entity schema (Person / Organization / Product) describing you.",
        evidence: "You have JSON-LD but no entity type that tells AI exactly who/what you are.",
      });
    if (hasFaqSchema) schema += 0.15;
    else
      findings.push({
        id: "no-faq-schema",
        severity: "med",
        area: "schema",
        message: "Add FAQPage schema to your answer content.",
        evidence: "FAQPage markup makes your answers directly extractable by answer engines.",
      });
  }

  // ── structure (25) ─────────────────────────────────────────────────────────
  let structure = 0;
  if (readable) {
    const home = readablePages[0];
    const anyH1 = readablePages.some((p) => p.h1s.length >= 1);
    const multiH1 = home.h1s.length > 1;
    const anyFaq = readablePages.some((p) => p.hasFaqSection);
    const answerFirst = readablePages.some((p) => p.firstParagraph != null && p.firstParagraph.length <= 320);

    structure = 0.25;
    if (anyH1) structure += 0.3;
    else
      findings.push({
        id: "no-h1",
        severity: "med",
        area: "structure",
        message: "No clear <h1> heading on your pages.",
        evidence: "A single descriptive H1 per page helps AI understand the page's subject.",
      });
    if (multiH1)
      findings.push({
        id: "multi-h1",
        severity: "low",
        area: "structure",
        message: "Your homepage has multiple <h1> headings.",
        evidence: "Use one H1 per page and structure the rest as H2/H3.",
        pages: [home.url],
      });
    if (anyFaq) structure += 0.25;
    else
      findings.push({
        id: "no-faq-section",
        severity: "med",
        area: "structure",
        message: "No FAQ / Q&A section found.",
        evidence: "AEO favors extractable Q&A. Add a FAQ that answers the exact questions people ask AI about you.",
      });
    if (answerFirst) structure += 0.2;
    else
      findings.push({
        id: "no-answer-first",
        severity: "low",
        area: "structure",
        message: "Lead with a concise, answer-first paragraph.",
        evidence: "Open each key page with a short, direct summary AI can quote.",
      });
  }

  // ── fetchability (25) ───────────────────────────────────────────────────────
  let fetchability = 0;
  if (readable) fetchability += 0.4; // server-rendered content is the big one
  if (input.aiCrawlersBlocked.length > 0) {
    findings.push({
      id: "ai-crawlers-blocked",
      severity: "high",
      area: "fetchability",
      message: `robots.txt blocks AI crawlers: ${input.aiCrawlersBlocked.join(", ")}.`,
      evidence: "If you want to appear in AI answers, allow these user-agents in robots.txt.",
    });
  } else {
    fetchability += 0.2;
  }
  if (input.hasSitemap) fetchability += 0.15;
  else
    findings.push({
      id: "no-sitemap",
      severity: "low",
      area: "fetchability",
      message: "No sitemap.xml found.",
      evidence: "A sitemap helps crawlers discover all your pages.",
    });
  const hasTitles = readablePages.some((p) => p.title);
  const hasMeta = readablePages.some((p) => p.metaDescription);
  const hasCanonical = readablePages.some((p) => p.canonical);
  if (hasTitles) fetchability += 0.1;
  if (hasMeta) fetchability += 0.1;
  else
    findings.push({
      id: "no-meta-description",
      severity: "low",
      area: "fetchability",
      message: "No meta description on your pages.",
      evidence: "Add concise meta descriptions — they're used as answer snippets.",
    });
  if (hasCanonical) fetchability += 0.05;
  const noindex = readablePages.find((p) => p.robotsMeta && /noindex/i.test(p.robotsMeta));
  if (noindex) {
    fetchability = Math.max(0, fetchability - 0.3);
    findings.push({
      id: "noindex",
      severity: "high",
      area: "fetchability",
      message: "A page is marked noindex.",
      evidence: "noindex tells search/answer engines to skip the page entirely.",
      pages: [noindex.url],
    });
  }
  fetchability = Math.min(1, fetchability);

  // ── entity clarity (15) ─────────────────────────────────────────────────────
  let entity = 0;
  const names = [subject.name, ...(subject.aliases ?? [])].filter(Boolean).map((n) => n.toLowerCase());
  const nameInTitleOrH1 = readablePages.some((p) => {
    const hay = `${p.title ?? ""} ${p.h1s.join(" ")}`.toLowerCase();
    return names.some((n) => n && hay.includes(n));
  });
  const nameInBody = readablePages.some((p) => names.some((n) => n && p.bodyText.toLowerCase().includes(n)));
  if (nameInTitleOrH1) entity = 1;
  else if (nameInBody) {
    entity = 0.5;
    findings.push({
      id: "entity-weak",
      severity: "med",
      area: "entity",
      message: `Your name appears in body text but not in a title or heading.`,
      evidence: `State "${subject.name}" plainly in a page title or H1 so AI can disambiguate and cite you.`,
    });
  } else if (readable) {
    findings.push({
      id: "entity-missing",
      severity: "high",
      area: "entity",
      message: `Your name ("${subject.name}") isn't stated plainly on the pages we read.`,
      evidence: "AI can't confidently identify or cite you if your identity isn't on the page.",
    });
  }

  // ── topic coverage (10) — coarse keyword/heading presence ───────────────────
  const topicCoverage = computeTopicCoverage(pages, subject.topics);
  const topics = subject.topics.filter((t) => t.trim());
  let topicScore = 1;
  if (topics.length > 0) {
    const covered = topics.filter((t) => topicCoverage[t]).length;
    topicScore = covered / topics.length;
    const missing = topics.filter((t) => !topicCoverage[t]);
    if (missing.length > 0 && readable) {
      findings.push({
        id: "topics-uncovered",
        severity: missing.length === topics.length ? "med" : "low",
        area: "topics",
        message: `Your site doesn't clearly cover: ${missing.join(", ")}.`,
        evidence: "Coarse keyword/heading check. Publish pages that directly address these topics to earn citations for them.",
      });
    }
  }

  const categoryScores: Record<SiteAuditArea, number> = {
    schema,
    structure,
    fetchability,
    entity,
    topics: topicScore,
  };

  const weighted = (Object.keys(WEIGHTS) as SiteAuditArea[]).reduce(
    (sum, area) => sum + categoryScores[area] * WEIGHTS[area],
    0,
  );
  const aiReadinessScore = Math.round(weighted);

  // Stable severity-then-area ordering for display.
  const sevRank = { high: 0, med: 1, low: 2 } as const;
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity]);

  return { aiReadinessScore, findings, readable, topicCoverage, categoryScores };
}

/** Build a ReadinessInput from a crawl result + subject. */
export function readinessInputFromCrawl(crawl: CrawlResult, subject: ReadinessSubject): ReadinessInput {
  return {
    pages: crawl.pages,
    robotsFetched: crawl.robotsFetched,
    aiCrawlersBlocked: crawl.aiCrawlersBlocked,
    hasSitemap: crawl.hasSitemap,
    subject,
  };
}

// ── DB wrapper ──────────────────────────────────────────────────────────────

/**
 * Crawl the subject's site, evaluate readiness, persist a `site_audits` row.
 * Caller (action layer) handles ownership + the "this fetches your site" confirm.
 */
export async function auditSite(
  subjectId: string,
  opts?: { maxPages?: number },
): Promise<SiteAudit> {
  const { db } = await import("@/lib/db/client");
  const { subjects } = await import("@/lib/db/schema");
  const { crawlSite } = await import("@/lib/crawl/crawler");

  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!subject) throw new Error("Subject not found.");
  if (!subject.siteUrl) throw new Error("No site URL set for this subject. Add one in Settings.");

  const crawl = await crawlSite(subject.siteUrl, { maxPages: opts?.maxPages });
  const result = evaluateReadiness(
    readinessInputFromCrawl(crawl, {
      name: subject.name,
      aliases: subject.aliases,
      topics: subject.topics,
    }),
  );

  const notes = crawl.notes.length > 0 ? crawl.notes.join(" ") : null;
  const [row] = await db
    .insert(siteAudits)
    .values({
      subjectId,
      url: crawl.startUrl,
      aiReadinessScore: result.aiReadinessScore,
      findings: result.findings,
      pagesCrawled: crawl.pagesCrawled,
      readable: result.readable,
      topicCoverage: result.topicCoverage,
      notes,
    })
    .returning();
  return row;
}

/** Latest persisted site audit for a subject (cache — don't re-crawl on every view). */
export async function getLatestSiteAudit(subjectId: string): Promise<SiteAudit | null> {
  const { db } = await import("@/lib/db/client");
  const [row] = await db
    .select()
    .from(siteAudits)
    .where(eq(siteAudits.subjectId, subjectId))
    .orderBy(desc(siteAudits.crawledAt))
    .limit(1);
  return row ?? null;
}
