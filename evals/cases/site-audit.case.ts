import { describe, expect, it } from "vitest";
import { parseHtml } from "@/lib/crawl/parse";
import { evaluateReadiness } from "@/lib/core/site-audit";
import { aiCrawlersBlocked, isPathAllowed, parseRobots } from "@/lib/crawl/robots";
import { isPrivateIPv4, UrlValidationError, validatePublicUrl } from "@/lib/crawl/ssrf";
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
});
