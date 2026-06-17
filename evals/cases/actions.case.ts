import { describe, expect, it } from "vitest";
import { buildOpportunities, type OpportunityInput } from "@/lib/core/actions";

const INPUT: OpportunityInput = {
  coverageGaps: [
    {
      promptId: "p1",
      promptText: "best math tutors online",
      topic: "mathematics",
      competingDomains: ["wikipedia.org", "reddit.com", "khanacademy.org"], // 3 → high impact
    },
    {
      promptId: "p2",
      promptText: "who is ada lovelace",
      topic: "bio",
      competingDomains: ["wikipedia.org"],
    },
  ],
  topDomains: [
    { domain: "wikipedia.org", count: 5, prompts: 3, engines: ["perplexity"], isYours: false }, // earn
    { domain: "reddit.com", count: 4, prompts: 2, engines: ["perplexity"], isYours: false }, // engage (UGC)
    { domain: "mysite.com", count: 2, prompts: 1, engines: ["perplexity"], isYours: true }, // yours → skip
  ],
  findings: [
    { id: "no-schema", severity: "high", area: "schema", message: "No structured data (JSON-LD) found.", evidence: "Add JSON-LD." },
    { id: "no-sitemap", severity: "low", area: "fetchability", message: "No sitemap.xml found." },
  ],
  topicCoverage: { mathematics: false, bio: true },
  hasSiteAudit: true,
};

describe("buildOpportunities — gap+finding → ranked Create/Improve/Earn/Engage", () => {
  const opps = buildOpportunities(INPUT);
  const byId = (id: string) => opps.find((o) => o.id === id);

  it("maps an uncovered-topic gap to CREATE with prompt + source evidence", () => {
    const create = byId("create-p1");
    expect(create?.kind).toBe("create");
    expect(create?.impact).toBe("high"); // 3 competing domains
    expect(create?.evidence.prompts).toContain("best math tutors online");
    expect(create?.evidence.sources).toContain("khanacademy.org");
  });

  it("maps a covered-topic gap to IMPROVE", () => {
    const improve = byId("improve-p2");
    expect(improve?.kind).toBe("improve");
    expect(improve?.targetTopic).toBe("bio");
  });

  it("turns a high-severity site finding into a low-effort IMPROVE and drops low-severity ones", () => {
    const fromFinding = byId("improve-finding-no-schema");
    expect(fromFinding?.kind).toBe("improve");
    expect(fromFinding?.impact).toBe("high");
    expect(fromFinding?.effort).toBe("low");
    expect(byId("improve-finding-no-sitemap")).toBeUndefined(); // low severity skipped
  });

  it("classifies strong non-UGC domains as EARN and UGC as ENGAGE; skips your own domain", () => {
    expect(byId("earn-wikipedia.org")?.kind).toBe("earn");
    expect(byId("earn-wikipedia.org")?.impact).toBe("high");
    expect(byId("engage-reddit.com")?.kind).toBe("engage");
    expect(opps.some((o) => o.id.includes("mysite.com"))).toBe(false);
  });

  it("ranks high-impact opportunities first", () => {
    const impacts = opps.map((o) => o.impact);
    const firstMed = impacts.indexOf("med");
    const lastHigh = impacts.lastIndexOf("high");
    if (firstMed !== -1 && lastHigh !== -1) expect(lastHigh).toBeLessThan(firstMed);
  });

  it("every opportunity carries concrete evidence (never a black box)", () => {
    for (const o of opps) {
      const n =
        (o.evidence.prompts?.length ?? 0) + (o.evidence.sources?.length ?? 0) + (o.evidence.findings?.length ?? 0);
      expect(n).toBeGreaterThan(0);
    }
  });
});

describe("buildOpportunities — review regressions", () => {
  it("treats a topic as covered despite case/phrasing differences (model-generated topics)", () => {
    const o = buildOpportunities({
      coverageGaps: [
        { promptId: "g1", promptText: "advanced math help", topic: "advanced mathematics", competingDomains: ["x.com"] },
      ],
      topDomains: [],
      findings: [],
      topicCoverage: { Mathematics: true }, // capitalized + shorter than the prompt's topic
      hasSiteAudit: true,
    });
    // "advanced mathematics" contains the covered "mathematics" → Improve, not Create.
    expect(o.find((x) => x.id === "improve-g1")?.kind).toBe("improve");
    expect(o.some((x) => x.id === "create-g1")).toBe(false);
  });

  it("keeps distinct gaps that share prompt text (dedupe by id, not title)", () => {
    const o = buildOpportunities({
      coverageGaps: [
        { promptId: "a", promptText: "same question", topic: "t", competingDomains: ["one.com"] },
        { promptId: "b", promptText: "same question", topic: "t", competingDomains: ["two.com"] },
      ],
      topDomains: [],
      findings: [],
      topicCoverage: { t: false },
      hasSiteAudit: true,
    });
    expect(o.filter((x) => x.kind === "create")).toHaveLength(2); // both survive
    expect(o.flatMap((x) => x.evidence.sources ?? [])).toEqual(expect.arrayContaining(["one.com", "two.com"]));
  });
});
