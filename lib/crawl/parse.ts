import * as cheerio from "cheerio";

/**
 * Parse a fetched HTML page into the structured signals the AI-readiness
 * evaluator needs. PURE (cheerio only, no network) so evaluateReadiness can be
 * eval-tested against saved HTML fixtures.
 */

export type JsonLdBlock = {
  raw: string;
  parsed: unknown | null;
  /** Extracted @type values (flattened through @graph). */
  types: string[];
  /**
   * Parses as JSON AND carries at least one @type. This is NOT full schema
   * validity (required-property checking arrives with the M6 schema validator)
   * — named to avoid callers reading it as "valid".
   */
  parsedWithType: boolean;
};

export type PageData = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  /** <meta name="robots"> content (noindex/nofollow live here). */
  robotsMeta: string | null;
  h1s: string[];
  headings: { level: number; text: string }[];
  jsonLd: JsonLdBlock[];
  hasFaqSection: boolean;
  /** First substantive paragraph — used for the answer-first heuristic. */
  firstParagraph: string | null;
  textLength: number;
  bodyText: string;
  internalLinks: string[];
  /** Tiny body + script bundles → likely a client-rendered shell cheerio can't read. */
  looksClientRendered: boolean;
  scriptCount: number;
};

const BODY_TEXT_CAP = 20_000;
/** Below this many chars of server-rendered text + ≥1 script → a JS shell. */
const CLIENT_SHELL_TEXT_MAX = 64;

function flattenTypes(node: unknown, out: string[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) flattenTypes(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  const t = obj["@type"];
  if (typeof t === "string") out.push(t);
  else if (Array.isArray(t)) for (const v of t) if (typeof v === "string") out.push(v);
  if (Array.isArray(obj["@graph"])) flattenTypes(obj["@graph"], out);
}

export function parseHtml(html: string, pageUrl: string, origin: string): PageData {
  const $ = cheerio.load(html);

  const attr = (sel: string, name: string): string | null => {
    const v = $(sel).first().attr(name);
    return v ? v.trim() : null;
  };

  const title = ($("title").first().text() || "").trim() || null;
  const metaDescription = attr('meta[name="description"]', "content");
  const canonical = attr('link[rel="canonical"]', "href");
  const robotsMeta = attr('meta[name="robots"]', "content");

  const h1s = $("h1")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const headings: { level: number; text: string }[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number((el as { tagName?: string }).tagName?.[1] ?? "0");
    const text = $(el).text().trim();
    if (level && text) headings.push({ level, text });
  });

  const jsonLd: JsonLdBlock[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const types: string[] = [];
    if (parsed) flattenTypes(parsed, types);
    jsonLd.push({ raw: raw.slice(0, 4000), parsed, types, parsedWithType: parsed != null && types.length > 0 });
  });

  // FAQ heuristic: a JSON-LD FAQPage, an explicit FAQ heading, or ≥2 question headings.
  const faqType = jsonLd.some((b) => b.types.some((t) => /faqpage|qapage/i.test(t)));
  const faqHeading = headings.some((h) => /\bfaqs?\b|frequently asked|common questions/i.test(h.text));
  const questionHeadings = headings.filter((h) => h.text.trim().endsWith("?")).length;
  const hasFaqSection = faqType || faqHeading || questionHeadings >= 2;

  // Body text — drop script/style/noscript so bundles don't inflate the count.
  const $body = $("body").clone();
  $body.find("script, style, noscript, template").remove();
  const bodyText = $body.text().replace(/\s+/g, " ").trim();
  const textLength = bodyText.length;

  const firstParagraph =
    $("p")
      .map((_, el) => $(el).text().trim())
      .get()
      .find((t) => t.length >= 40) ?? null;

  const scriptCount = $("script").length;
  // A near-empty body alongside script tags → a JS shell cheerio can't read.
  // Kept BELOW site-audit's readable-text floor (120) so a thin-but-server-rendered
  // page (120–399 chars) is never misclassified as "JavaScript-only".
  const looksClientRendered = textLength < CLIENT_SHELL_TEXT_MAX && scriptCount >= 1;

  // Same-origin internal links (absolute, deduped, no fragments/mailto/tel).
  const seen = new Set<string>();
  const internalLinks: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(mailto:|tel:|javascript:|#)/i.test(href.trim())) return;
    let abs: URL;
    try {
      abs = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (abs.origin !== origin) return;
    abs.hash = "";
    const norm = abs.toString();
    if (seen.has(norm)) return;
    seen.add(norm);
    internalLinks.push(norm);
  });

  return {
    url: pageUrl,
    title,
    metaDescription,
    canonical,
    robotsMeta,
    h1s,
    headings,
    jsonLd,
    hasFaqSection,
    firstParagraph,
    textLength,
    bodyText: bodyText.slice(0, BODY_TEXT_CAP),
    internalLinks,
    looksClientRendered,
    scriptCount,
  };
}
