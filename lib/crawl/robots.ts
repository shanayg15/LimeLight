/**
 * Minimal but correct robots.txt parsing. Politeness is mandatory: we obey the
 * matching group's Allow/Disallow rules for our own UA, and we surface which
 * major AI crawlers the site blocks (a fetchability finding for the audit).
 *
 * Pure + deterministic → eval-tested without the network.
 */

export type RobotsGroup = { agents: string[]; allow: string[]; disallow: string[] };
export type RobotsRules = { groups: RobotsGroup[]; sitemaps: string[] };

/** Our crawler's UA token (see lib/crawl/fetch.ts for the full header). */
export const CRAWLER_UA_TOKEN = "LimelightBot";

/** Known AI assistant crawlers/fetchers — we report when a site blocks these. */
export const AI_CRAWLER_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "Bytespider",
] as const;

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  // Consecutive `User-agent:` lines share the following rules.
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (field === "allow") current.allow.push(value);
    else if (field === "disallow") current.disallow.push(value);
  }
  return { groups, sitemaps };
}

/** Pick the most specific group for a UA: exact/substring match, else `*`. */
function groupFor(rules: RobotsRules, userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let best: RobotsGroup | null = null;
  let bestLen = -1;
  let star: RobotsGroup | null = null;
  for (const g of rules.groups) {
    for (const a of g.agents) {
      if (a === "*") {
        star = star ?? g;
        continue;
      }
      // Google's rule: a group applies if the crawler name contains the token.
      if (ua.includes(a) && a.length > bestLen) {
        best = g;
        bestLen = a.length;
      }
    }
  }
  return best ?? star;
}

/** Does `pattern` match `path`? Supports `*` wildcard and `$` end-anchor. */
function patternMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false; // empty Disallow/Allow matches nothing
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  if (!body.includes("*")) {
    return anchored ? path === body || path.startsWith(body) && path.length === body.length : path.startsWith(body);
  }
  // Translate the glob to a regex.
  const re = new RegExp(
    "^" + body.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""),
  );
  return re.test(path);
}

/** robots.txt allow/disallow decision for a UA + path (longest match wins; Allow breaks ties). */
export function isPathAllowed(rules: RobotsRules, path: string, userAgent: string): boolean {
  const group = groupFor(rules, userAgent);
  if (!group) return true; // no matching group → allowed
  const p = path || "/";

  let bestAllowLen = -1;
  for (const a of group.allow) if (patternMatches(a, p)) bestAllowLen = Math.max(bestAllowLen, a.replace(/\$$/, "").length);
  let bestDisLen = -1;
  for (const d of group.disallow) if (patternMatches(d, p)) bestDisLen = Math.max(bestDisLen, d.replace(/\$$/, "").length);

  if (bestDisLen === -1) return true; // nothing disallows it
  if (bestAllowLen >= bestDisLen) return true; // Allow at least as specific wins
  return false;
}

/** Which AI crawlers are blocked from the site root (`/`). */
export function aiCrawlersBlocked(rules: RobotsRules): string[] {
  return AI_CRAWLER_AGENTS.filter((agent) => !isPathAllowed(rules, "/", agent));
}
