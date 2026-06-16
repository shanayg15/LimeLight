import { describe, expect, it } from "vitest";
import { mapPerplexityCitations } from "@/lib/engines/perplexity";
import { extractCitations } from "@/lib/core/extract";
import type { EngineResult } from "@/lib/engines/types";
import { PPLX_NO_SOURCES, PPLX_WITH_SOURCES } from "../fixtures/perplexity-response";

describe("mapPerplexityCitations — real sources, no fabrication", () => {
  it("maps search_results to normalized, deduped citations", () => {
    const cites = mapPerplexityCitations(PPLX_WITH_SOURCES);
    // 4 results, one duplicate URL -> 3 unique
    expect(cites).toHaveLength(3);
    expect(cites.map((c) => c.domain)).toEqual([
      "en.wikipedia.org",
      "britannica.com", // www. stripped
      "computerhistory.org",
    ]);
    expect(cites.map((c) => c.rank)).toEqual([1, 2, 3]);
    // never invents URLs not in the response
    for (const c of cites) {
      expect(c.url.startsWith("http")).toBe(true);
    }
  });

  it("yields ZERO citations when the engine returned no sources (never fabricates)", () => {
    expect(mapPerplexityCitations(PPLX_NO_SOURCES)).toEqual([]);
  });
});

describe("extractCitations — defensive re-normalization", () => {
  it("dedupes and re-normalizes domains from an engine result", () => {
    const result: EngineResult = {
      text: "...",
      model: "sonar",
      searchEnabled: true,
      citations: [
        { url: "https://WWW.Example.com/a", domain: "www.example.com", rank: 1 },
        { url: "https://www.example.com/a", domain: "example.com", rank: 2 }, // dup url
        { url: "https://blog.example.com/b", domain: "blog.example.com", rank: 3 },
      ],
    };
    const cites = extractCitations(result);
    expect(cites).toHaveLength(2);
    expect(cites[0].domain).toBe("example.com");
    expect(cites[1].domain).toBe("blog.example.com");
  });

  it("returns empty for a no-citation result", () => {
    const result: EngineResult = { text: "x", model: "sonar", searchEnabled: true, citations: [] };
    expect(extractCitations(result)).toEqual([]);
  });
});
