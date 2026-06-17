import { politeFetch, CRAWLER_USER_AGENT } from "./fetch";
import { parseHtml, type PageData } from "./parse";
import {
  aiCrawlersBlocked,
  CRAWLER_UA_TOKEN,
  isPathAllowed,
  parseRobots,
  type RobotsRules,
} from "./robots";
import { validatePublicUrl } from "./ssrf";

export type CrawlResult = {
  origin: string;
  startUrl: string;
  pages: PageData[];
  robots: RobotsRules;
  robotsFetched: boolean;
  hasSitemap: boolean;
  aiCrawlersBlocked: string[];
  pagesCrawled: number;
  truncated: boolean;
  notes: string[];
};

export type CrawlOptions = {
  /** Hard cap on pages (≤ 25 for v1). */
  maxPages?: number;
  /** Delay between requests (rate-limit). */
  delayMs?: number;
  /** Overall wall-clock budget for an interactive run. */
  totalBudgetMs?: number;
  perPageTimeoutMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Crawl the user's own site politely: robots-respecting, same-origin only,
 * rate-limited, page/byte/time-capped, SSRF-safe (validated in politeFetch).
 * Returns parsed page data + fetchability signals for the readiness evaluator.
 */
export async function crawlSite(rawUrl: string, opts: CrawlOptions = {}): Promise<CrawlResult> {
  const maxPages = Math.min(Math.max(1, opts.maxPages ?? 12), 25);
  const delayMs = opts.delayMs ?? 350;
  const totalBudgetMs = opts.totalBudgetMs ?? 25_000;
  const perPageTimeoutMs = opts.perPageTimeoutMs ?? 10_000;

  const start = validatePublicUrl(rawUrl); // throws UrlValidationError on unsafe URL
  const origin = start.origin;
  const startedAt = Date.now();
  const notes: string[] = [];

  // 1) robots.txt — fetched first; rules obeyed for our UA.
  let robots: RobotsRules = { groups: [], sitemaps: [] };
  let robotsFetched = false;
  try {
    const r = await politeFetch(new URL("/robots.txt", origin).toString(), { timeoutMs: 6000, maxBytes: 500_000 });
    if (r.ok && r.body) {
      robots = parseRobots(r.body);
      robotsFetched = true;
    }
  } catch {
    notes.push("Couldn't fetch robots.txt — proceeding conservatively (own-origin only).");
  }

  // 2) Sitemap signal (from robots, else probe /sitemap.xml — we don't crawl it).
  let hasSitemap = robots.sitemaps.length > 0;
  if (!hasSitemap) {
    try {
      const s = await politeFetch(new URL("/sitemap.xml", origin).toString(), { timeoutMs: 5000, maxBytes: 100_000 });
      hasSitemap = s.ok && /<(urlset|sitemapindex)/i.test(s.body);
    } catch {
      /* ignore */
    }
  }

  // 3) BFS same-origin from the start URL, respecting robots for our UA.
  const queue: string[] = [start.toString()];
  const enqueued = new Set<string>(queue);
  const pages: PageData[] = [];
  let truncated = false;

  while (queue.length > 0 && pages.length < maxPages) {
    if (Date.now() - startedAt > totalBudgetMs) {
      truncated = true;
      notes.push("Crawl time budget reached — audited a sample of pages.");
      break;
    }
    const next = queue.shift()!;
    const path = new URL(next).pathname || "/";
    if (robotsFetched && !isPathAllowed(robots, path, CRAWLER_UA_TOKEN)) {
      continue; // politeness: skip disallowed paths
    }

    let res;
    try {
      res = await politeFetch(next, { timeoutMs: perPageTimeoutMs });
    } catch {
      continue; // SSRF-blocked or network error on this link — skip it
    }
    if (!res.ok || !res.isHtml || !res.body) continue;

    const page = parseHtml(res.body, res.finalUrl, origin);
    pages.push(page);

    // Enqueue same-origin children up to the cap.
    for (const link of page.internalLinks) {
      if (pages.length + enqueued.size >= maxPages * 3) break; // bound the frontier
      if (!enqueued.has(link)) {
        enqueued.add(link);
        queue.push(link);
      }
    }

    if (queue.length > 0 && pages.length < maxPages) await sleep(delayMs);
  }

  if (queue.length > 0 && pages.length >= maxPages) {
    truncated = true;
    notes.push(`Stopped at the ${maxPages}-page cap for v1.`);
  }

  return {
    origin,
    startUrl: start.toString(),
    pages,
    robots,
    robotsFetched,
    hasSitemap,
    aiCrawlersBlocked: robotsFetched ? aiCrawlersBlocked(robots) : [],
    pagesCrawled: pages.length,
    truncated,
    notes,
  };
}

export { CRAWLER_USER_AGENT };
