import { describe, expect, it } from "vitest";
import { buildSnippet, classifyHit, coarsePath, coarseUserAgent } from "@/lib/core/analytics";

describe("classifyHit — AI bot vs human referral, no false positives", () => {
  it("classifies known AI crawlers by user-agent", () => {
    expect(classifyHit({ userAgent: "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)" })).toEqual({ type: "bot", engine: "openai" });
    expect(classifyHit({ userAgent: "ClaudeBot/1.0" })).toEqual({ type: "bot", engine: "claude" });
    expect(classifyHit({ userAgent: "PerplexityBot/1.0" })).toEqual({ type: "bot", engine: "perplexity" });
    expect(classifyHit({ userAgent: "Mozilla/5.0 (compatible; Google-Extended)" })).toEqual({ type: "bot", engine: "gemini" });
  });

  it("classifies human referrals from AI assistants by referrer host", () => {
    expect(classifyHit({ referrer: "https://chatgpt.com/" })).toEqual({ type: "referral", engine: "openai" });
    expect(classifyHit({ referrer: "https://www.perplexity.ai/search?q=x" })).toEqual({ type: "referral", engine: "perplexity" });
    expect(classifyHit({ referrer: "https://gemini.google.com/app" })).toEqual({ type: "referral", engine: "gemini" });
    expect(classifyHit({ referrer: "https://claude.ai/chat/123" })).toEqual({ type: "referral", engine: "claude" });
  });

  it("returns null for ordinary traffic (no AI signal)", () => {
    expect(classifyHit({ userAgent: "Mozilla/5.0 (Macintosh) Chrome/120", referrer: "https://google.com/search" })).toBeNull();
    expect(classifyHit({ userAgent: "Googlebot/2.1", referrer: "" })).toBeNull(); // general crawler, not an AI engine
    expect(classifyHit({})).toBeNull();
  });

  it("does NOT count ordinary Bing web search as an AI referral (regression)", () => {
    expect(classifyHit({ referrer: "https://www.bing.com/search?q=x" })).toBeNull();
    expect(classifyHit({ referrer: "https://bing.com/" })).toBeNull();
    // Copilot's own host is still an AI referral.
    expect(classifyHit({ referrer: "https://copilot.microsoft.com/" })).toEqual({ type: "referral", engine: "copilot" });
  });

  it("bot (UA) takes precedence over referral", () => {
    expect(classifyHit({ userAgent: "GPTBot/1.0", referrer: "https://chatgpt.com/" })).toEqual({ type: "bot", engine: "openai" });
  });
});

describe("no PII — coarse signals only", () => {
  it("coarsePath strips query + hash + control chars + forces a leading slash (no tokens/PII)", () => {
    expect(coarsePath("/blog/post?utm=x&token=secret#section")).toBe("/blog/post");
    expect(coarsePath("/")).toBe("/");
    expect(coarsePath(null)).toBeNull();
    expect(coarsePath("https://evil.com/x?t=1")).toBe("/x"); // host dropped, coerced to path
    expect(coarsePath("/x" + String.fromCharCode(0) + "y")).toBe("/xy"); // control char stripped
  });

  it("coarseUserAgent reduces to a family/bot token — never the full UA (regression)", () => {
    const fullChrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    expect(coarseUserAgent(fullChrome)).toBe("Chrome");
    expect(coarseUserAgent(fullChrome)).not.toContain("Macintosh"); // no fingerprintable detail retained
    expect(coarseUserAgent("GPTBot/1.1")).toBe("gptbot");
    expect(coarseUserAgent("Mozilla/5.0 Firefox/121")).toBe("Firefox");
    expect(coarseUserAgent(null)).toBeNull();
  });
});

describe("buildSnippet — opt-in beacon the user pastes on their own site", () => {
  const s = buildSnippet("subj-123", "https://app.example");
  it("targets the collector with the subject token and sends only path + referrer", () => {
    expect(s).toContain("https://app.example/api/collect?s=subj-123");
    expect(s).toContain("location.pathname");
    expect(s).toContain("document.referrer");
    expect(s).toContain("sendBeacon");
    // No cookies / storage / PII collection in the snippet.
    expect(s).not.toMatch(/cookie|localStorage|navigator\.userAgent/i);
  });
});
