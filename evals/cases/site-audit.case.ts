import { describe, expect, it } from "vitest";
import { parseHtml } from "@/lib/crawl/parse";
import { computeTopicCoverage, evaluateReadiness } from "@/lib/core/site-audit";
import { aiCrawlersBlocked, isPathAllowed, parseRobots } from "@/lib/crawl/robots";
import { isBlockedIPv6, isPrivateIPv4, UrlValidationError, validatePublicUrl } from "@/lib/crawl/ssrf";
import { RICH_PAGE_HTML, THIN_PAGE_HTML, ROBOTS_TXT } from "@/evals/fixtures/site-pages";

const SUBJECT = { name: "Ada Lovelace", aliases: [], topics: ["mathematics", "analytical engines"] };
const ORIGIN = "https://adalovelace.example";

describe("evaluateReadiness — honest scoring against HTML fixtures", () => {
  it("scores a well-structured, schema-rich page high with no high-severity findings", () => {
    const page = parseHtml(RICH_PAGE_HTML, `${ORIGIN}/`, ORIGIN);
    const r = evaluateReadiness({
      pages: [page],
      robotsFetched: true,
      aiCrawlersBlocked: [],
      hasSitemap: true,
      subject: SUBJECT,
    });
    expect(r.readable).toBe(true);
    expect(r.aiReadinessScore).toBeGreaterThanOrEqual(80);
    expect(r.findings.filter((f) => f.severity === "high")).toHaveLength(0);
    // Entity + FAQ schema present → no schema-gap findings.
    expect(r.findings.some((f) => f.id === "no-schema")).toBe(false);
    expect(r.findings.some((f) => f.id === "no-faq-section")).toBe(false);
    expect(r.topicCoverage["mathematics"]).toBe(true);
    expect(r.topicCoverage["analytical engines"]).toBe(true);
  });

  it("scores a thin/JS-only page low with the expected specific findings", () => {
    const page = parseHtml(THIN_PAGE_HTML, `${ORIGIN}/`, ORIGIN);
    const r = evaluateReadiness({
      pages: [page],
      robotsFetched: true,
      aiCrawlersBlocked: [],
      hasSitemap: false,
      subject: SUBJECT,
    });
    expect(r.readable).toBe(false);
    expect(r.aiReadinessScore).toBeLessThan(30);
    expect(r.findings.some((f) => f.id === "client-rendered" && f.severity === "high")).toBe(true);
    expect(r.findings.some((f) => f.id === "no-schema" && f.severity === "high")).toBe(true);
  });

  it("flags blocked AI crawlers as a high fetchability finding", () => {
    const page = parseHtml(RICH_PAGE_HTML, `${ORIGIN}/`, ORIGIN);
    const r = evaluateReadiness({
      pages: [page],
      robotsFetched: true,
      aiCrawlersBlocked: ["GPTBot"],
      hasSitemap: true,
      subject: SUBJECT,
    });
    const f = r.findings.find((x) => x.id === "ai-crawlers-blocked");
    expect(f?.severity).toBe("high");
    expect(f?.message).toContain("GPTBot");
  });

  it("reports no pages crawled honestly", () => {
    const r = evaluateReadiness({
      pages: [],
      robotsFetched: false,
      aiCrawlersBlocked: [],
      hasSitemap: false,
      subject: SUBJECT,
    });
    expect(r.readable).toBe(false);
    expect(r.findings.some((f) => f.id === "no-pages")).toBe(true);
  });
});

describe("robots.txt — parse, longest-match Allow/Disallow, AI-crawler detection", () => {
  const rules = parseRobots(ROBOTS_TXT);

  it("parses groups + sitemap", () => {
    expect(rules.groups.length).toBe(2);
    expect(rules.sitemaps).toEqual(["https://adalovelace.example/sitemap.xml"]);
  });

  it("blocks GPTBot from everything but allows our UA at root", () => {
    expect(isPathAllowed(rules, "/", "GPTBot")).toBe(false);
    expect(isPathAllowed(rules, "/", "LimelightBot")).toBe(true);
  });

  it("applies longest-match: /private blocked, /private/public allowed", () => {
    expect(isPathAllowed(rules, "/private/secret", "LimelightBot")).toBe(false);
    expect(isPathAllowed(rules, "/private/public", "LimelightBot")).toBe(true);
  });

  it("aiCrawlersBlocked lists GPTBot but not ClaudeBot (uses the * group, / allowed)", () => {
    const blocked = aiCrawlersBlocked(rules);
    expect(blocked).toContain("GPTBot");
    expect(blocked).not.toContain("ClaudeBot");
  });
});

describe("SSRF guard — validatePublicUrl rejects non-public targets (no network)", () => {
  it("accepts a normal public URL and normalizes scheme-less input", () => {
    expect(validatePublicUrl("https://example.com/path").hostname).toBe("example.com");
    expect(validatePublicUrl("example.com").protocol).toBe("https:");
  });

  it("rejects loopback, private, link-local, CGNAT and metadata addresses", () => {
    for (const u of [
      "http://localhost",
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://192.168.1.1",
      "http://172.16.0.1",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1",
      "https://[::1]/",
    ]) {
      expect(() => validatePublicUrl(u), u).toThrow(UrlValidationError);
    }
  });

  it("rejects non-http(s) schemes and internal hostnames", () => {
    for (const u of ["file:///etc/passwd", "ftp://example.com", "data:text/html,x", "https://db.internal", "https://api.local"]) {
      expect(() => validatePublicUrl(u), u).toThrow(UrlValidationError);
    }
  });

  it("isPrivateIPv4 classifies ranges correctly", () => {
    expect(isPrivateIPv4("8.8.8.8")).toBe(false);
    expect(isPrivateIPv4("10.1.2.3")).toBe(true);
    expect(isPrivateIPv4("172.20.0.1")).toBe(true);
    expect(isPrivateIPv4("172.32.0.1")).toBe(false); // outside 172.16/12
    expect(isPrivateIPv4("169.254.169.254")).toBe(true);
  });

  it("blocks IPv4-in-IPv6 even when the URL parser normalizes to hex (regression)", () => {
    // WHATWG URL normalizes [::ffff:127.0.0.1] → [::ffff:7f00:1]; both must block.
    expect(isBlockedIPv6("::ffff:7f00:1")).toBe(true); // 127.0.0.1 mapped (hex)
    expect(isBlockedIPv6("::ffff:127.0.0.1")).toBe(true); // dotted form
    expect(isBlockedIPv6("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254 metadata
    expect(isBlockedIPv6("::127.0.0.1")).toBe(true); // IPv4-compatible
    expect(isBlockedIPv6("64:ff9b::7f00:1")).toBe(true); // NAT64 → 127.0.0.1
    expect(isBlockedIPv6("::ffff:8.8.8.8")).toBe(false); // public embedded v4 is fine
    for (const u of ["http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://[64:ff9b::7f00:1]/"]) {
      expect(() => validatePublicUrl(u), u).toThrow(UrlValidationError);
    }
  });

  it("blocks trailing-dot FQDN forms of internal hosts (regression)", () => {
    for (const u of ["http://localhost.", "https://db.internal.", "https://api.local."]) {
      expect(() => validatePublicUrl(u), u).toThrow(UrlValidationError);
    }
  });
});

describe("scoring edge cases the M5 review surfaced", () => {
  const SUBJ_NO_TOPICS = { name: "Ada Lovelace", aliases: [], topics: [] };

  it("does not mislabel a thin-but-server-rendered page as JavaScript-only (regression)", () => {
    // ~200 chars of real server text + an analytics script: server-rendered, just thin.
    const html = `<html><head><title>Ada Lovelace</title></head><body><h1>Ada Lovelace</h1><p>${"Ada Lovelace is a mathematician who studied analytical engines and wrote the first algorithm for them, influencing modern computing history. ".repeat(2)}</p><script src="/analytics.js"></script></body></html>`;
    const page = parseHtml(html, "https://x.example/", "https://x.example");
    const r = evaluateReadiness({ pages: [page], robotsFetched: true, aiCrawlersBlocked: [], hasSitemap: true, subject: SUBJ_NO_TOPICS });
    expect(r.readable).toBe(true);
    expect(r.findings.some((f) => f.id === "client-rendered")).toBe(false);
  });

  it("does not bank free topic points for a site with no topics (renormalized weights)", () => {
    // Unreadable site + subject with no topics: must NOT inflate via a default-1.0 topics score.
    const unreadable = evaluateReadiness({
      pages: [parseHtml(THIN_PAGE_HTML, "https://x.example/", "https://x.example")],
      robotsFetched: true,
      aiCrawlersBlocked: [],
      hasSitemap: true,
      subject: SUBJ_NO_TOPICS,
    });
    expect(unreadable.categoryScores.topics).toBe(0);
    expect(unreadable.aiReadinessScore).toBeLessThan(20);
  });
});

describe("computeTopicCoverage — word-boundary, not naive substring (regression)", () => {
  // Pages must clear the readable-text floor (120 chars) to be scanned.
  const pad = " Please send me an email about the latest details and remember to maintain the templates carefully every single week.";

  it("does not false-positive short topics inside larger words", () => {
    const html = `<html><body><p>${pad}${pad}</p></body></html>`;
    const cov = computeTopicCoverage([parseHtml(html, "https://x.example/", "https://x.example")], ["AI", "ML"]);
    expect(cov["AI"]).toBe(false); // not matched inside "email"/"maintain"/"details"
    expect(cov["ML"]).toBe(false); // not matched inside "templates"
  });

  it("matches a real whole-word topic", () => {
    const html = `<html><body><h2>Our AI tools</h2><p>We build AI for teams.${pad}</p></body></html>`;
    expect(computeTopicCoverage([parseHtml(html, "https://x.example/", "https://x.example")], ["AI"])["AI"]).toBe(true);
  });
});
