import { normalizeDomain, type EngineCitation, type EngineResult } from "@/lib/engines/types";

/**
 * Citations come pre-mapped from each adapter's search/grounding path. This
 * re-normalizes the domain and dedupes by URL defensively (cheap insurance —
 * URLs are NEVER parsed out of prose here or anywhere). A no-citation response
 * yields an empty array; nothing is fabricated.
 */
export function extractCitations(result: EngineResult): EngineCitation[] {
  const seen = new Set<string>();
  const out: EngineCitation[] = [];
  let rank = 1;
  for (const c of result.citations) {
    if (!c?.url) continue;
    const domain = normalizeDomain(c.url) ?? c.domain;
    if (!domain) continue;
    const key = c.url.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: c.url.trim(), domain: domain.toLowerCase(), title: c.title, rank: rank++ });
  }
  return out;
}
