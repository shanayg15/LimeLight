import { describe, expect, it } from "vitest";
import { buildKeylessAnswer, dataCitations, detectActionIntent, hasAnyData, type AssistantData } from "@/lib/core/assistant";

const DATA: AssistantData = {
  subjectName: "Ada Lovelace",
  latestRun: { id: "r1", createdAt: new Date("2026-06-10T00:00:00Z"), scores: { visibilityScore: 0.5, promptsMentionedCount: 5, shareOfVoice: 0.4, avgPosition: 2.2, citationFrequency: 0.2, promptCount: 10, subjectMentionCount: 5, competitorMentionCount: 7, hasCompetitors: true, perEngine: [] } },
  weakPrompts: ["best analytical engine resources"],
  topDomains: [{ domain: "wikipedia.org", isYours: false, count: 4 }],
  coverageGaps: [{ promptText: "best math tutors", competingDomains: ["khanacademy.org", "reddit.com"] }],
  siteFindings: [{ message: "No FAQ section", severity: "med" }],
  draftTitles: ["Ada Lovelace: Profile"],
  opportunities: [{ title: "Publish content answering 'best math tutors'", kind: "create" }],
  changed: { visibilityDelta: 0.2, gained: ["who is ada"], lost: [], comparable: true },
  retrieved: [],
};

describe("detectActionIntent — proposes + routes to confirm UI, never executes", () => {
  it("maps effectful asks to a confirm-gated route (a proposal, not an action)", () => {
    expect(detectActionIntent("export this draft as HTML")).toMatchObject({ kind: "export", href: "/app/content" });
    expect(detectActionIntent("schedule weekly tracking")).toMatchObject({ kind: "schedule", href: "/app/tracking" });
    expect(detectActionIntent("email me a digest")).toMatchObject({ kind: "email", href: "/app/tracking" });
    expect(detectActionIntent("draft content for my weakest topic")).toMatchObject({ kind: "draft", href: "/app/actions" });
  });
  it("every proposed action routes into the app (a screen the user confirms on)", () => {
    for (const q of ["export it", "schedule it", "send me an email digest", "write a page"]) {
      const a = detectActionIntent(q);
      expect(a && a.href.startsWith("/app/")).toBe(true);
    }
  });
  it("returns null for a read-only question (no action proposed)", () => {
    expect(detectActionIntent("what am I losing visibility on?")).toBeNull();
    expect(detectActionIntent("summarize my visibility")).toBeNull();
  });
});

describe("buildKeylessAnswer — grounded in the user's own data, declines when unsupported", () => {
  it("answers 'what am I losing on' from the coverage gaps (cites the data)", () => {
    const ans = buildKeylessAnswer("what am I losing visibility on?", DATA);
    expect(ans).toMatch(/best math tutors/);
    expect(ans).toMatch(/khanacademy\.org/);
  });
  it("summarizes visibility from the last audit's scores", () => {
    const ans = buildKeylessAnswer("summarize my visibility", DATA);
    expect(ans).toMatch(/50%/);
    expect(ans).toMatch(/5 of 10/);
  });
  it("reports what changed only from the diff", () => {
    expect(buildKeylessAnswer("what changed since last run?", DATA)).toMatch(/rose 20 pts/);
  });
  it("DECLINES an out-of-scope question instead of inventing external facts", () => {
    const ans = buildKeylessAnswer("what's the capital of France?", DATA);
    expect(ans).toMatch(/only answer from your Limelight data|don't have data/i);
    expect(ans).not.toMatch(/paris/i); // never fabricates an external fact
  });
  it("doesn't claim to perform a draft — routes to confirm instead", () => {
    const ans = buildKeylessAnswer("write content for my weakest topic", DATA);
    expect(ans).toMatch(/Actions|confirm/i);
    expect(ans).toMatch(/can't write it here/i);
  });
});

describe("dataCitations / hasAnyData", () => {
  it("cites exactly the data blocks that exist", () => {
    const kinds = dataCitations(DATA).map((c) => c.kind);
    expect(kinds).toContain("run");
    expect(kinds).toContain("sources");
    expect(kinds).toContain("site_audit");
    expect(dataCitations(DATA).find((c) => c.kind === "run")?.href).toBe("/app/visibility");
  });
  it("hasAnyData is false for an empty subject (so the assistant declines, not invents)", () => {
    const empty: AssistantData = { subjectName: "x", latestRun: null, weakPrompts: [], topDomains: [], coverageGaps: [], siteFindings: [], draftTitles: [], opportunities: [], changed: null, retrieved: [] };
    expect(hasAnyData(empty)).toBe(false);
    expect(hasAnyData(DATA)).toBe(true);
  });
});
