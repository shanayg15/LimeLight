import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditRuns, siteAudits, type Subject } from "@/lib/db/schema";
import { findContentGaps, type Opportunity } from "@/lib/core/actions";
import { analyzeSources } from "@/lib/core/sources";
import type { IngestPage } from "@/lib/core/embeddings";

/**
 * Shared resolvers between the actions page and content generation: turn a
 * subject into its current opportunities, and gather the pages we ground
 * generation on (the user's own pages + the pages that actually earn citations).
 */

async function latestIds(subjectId: string): Promise<{ runId?: string; siteAuditId?: string }> {
  const [run] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(eq(auditRuns.subjectId, subjectId))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);
  const [site] = await db
    .select({ id: siteAudits.id })
    .from(siteAudits)
    .where(eq(siteAudits.subjectId, subjectId))
    .orderBy(desc(siteAudits.crawledAt))
    .limit(1);
  return { runId: run?.id, siteAuditId: site?.id };
}

export async function getOpportunitiesForSubject(subjectId: string): Promise<Opportunity[]> {
  const { runId, siteAuditId } = await latestIds(subjectId);
  if (!runId && !siteAuditId) return [];
  return findContentGaps(runId, siteAuditId);
}

/**
 * Gather grounding pages: crawl the user's own site (capped) + fetch the top
 * cited third-party pages for the topic (what earns citations now). Polite +
 * SSRF-safe (reuses M5's crawler/fetch). Best-effort — failures are skipped.
 */
export async function gatherGroundingPages(
  subject: Subject,
  opportunity: Opportunity,
  opts: { maxOwnPages?: number; maxCitedPages?: number } = {},
): Promise<IngestPage[]> {
  const maxOwn = opts.maxOwnPages ?? 5;
  const maxCited = opts.maxCitedPages ?? 3;
  const out: IngestPage[] = [];

  // (a) The user's own pages — their voice + facts.
  if (subject.siteUrl) {
    try {
      const { crawlSite } = await import("@/lib/crawl/crawler");
      const crawl = await crawlSite(subject.siteUrl, { maxPages: maxOwn, totalBudgetMs: 18_000 });
      for (const p of crawl.pages) {
        if (p.bodyText.trim().length >= 80) {
          out.push({ url: p.url, sourceType: "own_page", topic: opportunity.targetTopic ?? null, text: p.bodyText });
        }
      }
    } catch {
      /* best-effort */
    }
  }

  // (b) Top cited third-party pages for the topic — what currently earns citations.
  const { runId } = await latestIds(subject.id);
  if (runId) {
    try {
      const sources = await analyzeSources(runId);
      const urls = (sources?.topUrls ?? []).filter((u) => !u.isYours).slice(0, maxCited);
      if (urls.length > 0) {
        const { politeFetch } = await import("@/lib/crawl/fetch");
        const { parseHtml } = await import("@/lib/crawl/parse");
        for (const u of urls) {
          try {
            const res = await politeFetch(u.url, { timeoutMs: 8000 });
            if (res.ok && res.isHtml && res.body) {
              const origin = new URL(res.finalUrl).origin;
              const page = parseHtml(res.body, res.finalUrl, origin);
              if (page.bodyText.trim().length >= 80) {
                out.push({ url: u.url, sourceType: "cited_page", topic: opportunity.targetTopic ?? null, text: page.bodyText });
              }
            }
          } catch {
            /* skip this source */
          }
        }
      }
    } catch {
      /* best-effort */
    }
  }

  return out;
}
