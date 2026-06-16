import { describe, expect, it } from "vitest";
import { aggregateSources, type SourceAggInput } from "@/lib/core/sources";
import { exceedsRunCap } from "@/lib/engines/pricing";

const INPUT: SourceAggInput = {
  subjectDomain: "mysite.com",
  responses: [
    { id: "r1", engine: "perplexity", promptId: "p1", searchEnabled: true },
    { id: "r2", engine: "claude", promptId: "p1", searchEnabled: true },
    // r3 is NOT search-grounded — its citations must be excluded from analytics.
    { id: "r3", engine: "gemini", promptId: "p2", searchEnabled: false },
    { id: "r4", engine: "perplexity", promptId: "p2", searchEnabled: true },
  ],
  citations: [
    { modelResponseId: "r1", url: "https://en.wikipedia.org/wiki/X", domain: "en.wikipedia.org", title: "X" },
    { modelResponseId: "r1", url: "https://mysite.com/about", domain: "mysite.com", title: "About" },
    { modelResponseId: "r2", url: "https://en.wikipedia.org/wiki/X", domain: "en.wikipedia.org", title: "X" },
    { modelResponseId: "r3", url: "https://spam.com/junk", domain: "spam.com", title: "Junk" }, // gated out
    { modelResponseId: "r4", url: "https://www.reddit.com/r/x", domain: "www.reddit.com", title: "thread" },
  ],
  subjectMentionByResponse: { r1: true, r2: false, r4: false },
  prompts: [
    { id: "p1", text: "Who is X?", topic: null },
    { id: "p2", text: "Best X tools", topic: "tools" },
  ],
};

describe("aggregateSources — top sources, yours-vs-third-party, gaps, searchEnabled gating", () => {
  const a = aggregateSources(INPUT);

  it("excludes citations from non-search-grounded responses", () => {
    expect(a.topDomains.some((d) => d.domain === "spam.com")).toBe(false);
  });

  it("counts domains across the run and flags yours", () => {
    const wiki = a.topDomains.find((d) => d.domain === "en.wikipedia.org")!;
    expect(wiki.count).toBe(2);
    expect(wiki.prompts).toBe(1);
    expect(new Set(wiki.engines)).toEqual(new Set(["perplexity", "claude"]));
    expect(wiki.isYours).toBe(false);

    const mine = a.topDomains.find((d) => d.domain === "mysite.com")!;
    expect(mine.isYours).toBe(true);

    // www. is normalized away
    expect(a.topDomains.some((d) => d.domain === "reddit.com")).toBe(true);
  });

  it("surfaces a coverage gap where third-party is cited but the subject is absent", () => {
    const gapIds = a.coverageGaps.map((g) => g.promptId);
    expect(gapIds).toContain("p2"); // not mentioned, not self-cited, reddit cited
    expect(gapIds).not.toContain("p1"); // subject mentioned in p1
    const p2 = a.coverageGaps.find((g) => g.promptId === "p2")!;
    expect(p2.competingDomains).toContain("reddit.com");
  });

  it("builds a per-engine breakdown (gemini absent — it had no grounded citations)", () => {
    const engines = a.perEngine.map((e) => e.engine);
    expect(engines).toContain("perplexity");
    expect(engines).toContain("claude");
    expect(engines).not.toContain("gemini");
  });

  it("returns empty analysis when no search-grounded citations", () => {
    const none = aggregateSources({ ...INPUT, citations: [], responses: INPUT.responses.map((r) => ({ ...r, searchEnabled: false })) });
    expect(none.hasSearchEnabledCitations).toBe(false);
    expect(none.topDomains).toEqual([]);
  });
});

describe("exceedsRunCap — pre-run cost cap (no live calls)", () => {
  it("rejects an over-cap config, allows under-cap, and treats null as no cap", () => {
    expect(exceedsRunCap(30, ["perplexity", "openai", "gemini", "claude"], 3, 0.01)).toBe(true);
    expect(exceedsRunCap(1, ["perplexity"], 1, 100)).toBe(false);
    expect(exceedsRunCap(30, ["perplexity"], 3, null)).toBe(false);
  });
});
