import { describe, expect, it } from "vitest";
import {
  capDecision,
  computeTrends,
  diffRuns,
  nextRunFrom,
  selectDueSchedules,
  type RunSnapshot,
  type TrendRun,
} from "@/lib/core/tracking";
import { buildDigestSummary, shouldSendDigest, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/core/digest";
import type { AuditScores } from "@/lib/db/schema";

function scores(over: Partial<AuditScores>): AuditScores {
  return {
    visibilityScore: 0,
    promptsMentionedCount: 0,
    shareOfVoice: null,
    avgPosition: null,
    citationFrequency: 0,
    promptCount: 0,
    subjectMentionCount: 0,
    competitorMentionCount: 0,
    hasCompetitors: false,
    perEngine: [],
    ...over,
  };
}

describe("nextRunFrom — cadence math", () => {
  const base = new Date("2026-06-01T00:00:00Z");
  it("advances by the right interval", () => {
    expect(nextRunFrom("weekly", base).toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(nextRunFrom("biweekly", base).toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(nextRunFrom("monthly", base).toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("selectDueSchedules — only due + enabled", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  const mk = (enabled: boolean, next: string | null) => ({ enabled, nextRunAt: next ? new Date(next) : null });
  it("selects enabled schedules whose nextRunAt has passed", () => {
    const list = [
      mk(true, "2026-06-10T00:00:00Z"), // due
      mk(true, "2026-06-20T00:00:00Z"), // future
      mk(false, "2026-06-01T00:00:00Z"), // disabled
      mk(true, null), // never scheduled
    ];
    const due = selectDueSchedules(list, now);
    expect(due).toHaveLength(1);
    expect(due[0].nextRunAt?.toISOString()).toBe("2026-06-10T00:00:00.000Z");
  });
});

describe("computeTrends — ordered series, overall + per engine", () => {
  const runs: TrendRun[] = [
    { id: "r2", createdAt: new Date("2026-06-08T00:00:00Z"), scores: scores({ visibilityScore: 0.6, perEngine: [{ engine: "perplexity", visibilityScore: 0.6, promptsMentioned: 6, promptCount: 10 }] }) },
    { id: "r1", createdAt: new Date("2026-06-01T00:00:00Z"), scores: scores({ visibilityScore: 0.4, perEngine: [{ engine: "perplexity", visibilityScore: 0.4, promptsMentioned: 4, promptCount: 10 }] }) },
    { id: "r0", createdAt: new Date("2026-05-25T00:00:00Z"), scores: null }, // excluded (no scores)
  ];
  const t = computeTrends(runs);
  it("orders by createdAt ascending and drops scoreless runs", () => {
    expect(t.overall.map((p) => p.runId)).toEqual(["r1", "r2"]);
    expect(t.overall.map((p) => p.visibility)).toEqual([0.4, 0.6]);
  });
  it("builds per-engine series", () => {
    const pe = t.perEngine.find((e) => e.engine === "perplexity")!;
    expect(pe.points.map((p) => p.visibility)).toEqual([0.4, 0.6]);
  });
});

describe("diffRuns — what changed between two runs", () => {
  const a: RunSnapshot = {
    runId: "a",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    engines: ["perplexity"],
    scores: scores({ visibilityScore: 0.5, shareOfVoice: 0.3 }),
    prompts: [
      { promptId: "p1", text: "who is X", mentioned: true, position: 3 },
      { promptId: "p2", text: "best X tools", mentioned: false, position: null },
      { promptId: "p3", text: "X reviews", mentioned: true, position: 2 },
    ],
    domains: ["wikipedia.org", "reddit.com"],
  };
  const b: RunSnapshot = {
    runId: "b",
    createdAt: new Date("2026-06-08T00:00:00Z"),
    engines: ["perplexity", "openai"],
    scores: scores({ visibilityScore: 0.7, shareOfVoice: 0.45 }),
    prompts: [
      { promptId: "p1", text: "who is X", mentioned: true, position: 1 }, // improved 3→1
      { promptId: "p2", text: "best X tools", mentioned: true, position: 4 }, // gained
      { promptId: "p3", text: "X reviews", mentioned: false, position: null }, // lost
    ],
    domains: ["wikipedia.org", "x.com"], // reddit lost, x.com new
  };
  const d = diffRuns(a, b);

  it("detects gained/lost mentions", () => {
    expect(d.gainedMentions.map((m) => m.promptId)).toEqual(["p2"]);
    expect(d.lostMentions.map((m) => m.promptId)).toEqual(["p3"]);
  });
  it("detects position moves with direction", () => {
    expect(d.positionImproved.map((m) => m.promptId)).toEqual(["p1"]);
    expect(d.positionRegressed).toHaveLength(0);
  });
  it("detects new/lost domains", () => {
    expect(d.newDomains).toEqual(["x.com"]);
    expect(d.lostDomains).toEqual(["reddit.com"]);
  });
  it("computes deltas + flags config mismatch", () => {
    expect(Math.round((d.visibilityDelta ?? 0) * 100)).toBe(20);
    expect(d.configMismatch).toBe(true); // perplexity vs perplexity+openai
  });
});

describe("capDecision — scheduled runs honor cost caps", () => {
  it("skips over-cap (per-run) and over-cap (monthly), allows under", () => {
    expect(capDecision(2.0, 0, { perRun: 1.0, monthly: null }).allowed).toBe(false);
    expect(capDecision(0.5, 9.8, { perRun: null, monthly: 10 }).allowed).toBe(false);
    expect(capDecision(0.5, 1, { perRun: 1, monthly: 10 }).allowed).toBe(true);
    expect(capDecision(99, 99, { perRun: null, monthly: null }).allowed).toBe(true); // no caps
  });
});

describe("digest gating — never send without opt-in", () => {
  it("shouldSendDigest requires email opt-in AND a Resend key", () => {
    expect(shouldSendDigest({ email: false }, true)).toBe(false);
    expect(shouldSendDigest({ email: true }, false)).toBe(false);
    expect(shouldSendDigest({ email: true }, true)).toBe(true);
    expect(shouldSendDigest(null, true)).toBe(false);
  });
  it("builds a plain-English summary from latest scores + diff", () => {
    const s = buildDigestSummary({
      subjectName: "Ada",
      latestScores: scores({ visibilityScore: 0.7 }),
      diff: { visibilityDelta: 0.2, shareOfVoiceDelta: 0.1, gainedMentions: [{ promptId: "p", text: "best X" }], lostMentions: [], positionImproved: [], positionRegressed: [], newDomains: [], lostDomains: [], configMismatch: false, enginesA: [], enginesB: [] },
      opportunities: [{ title: "Publish X" }],
    });
    expect(s.headline).toMatch(/up 20 pts/);
    expect(s.gained).toContain("best X");
    expect(s.newOpportunities).toContain("Publish X");
  });
  it("unsubscribe token round-trips and rejects tampering", () => {
    const tok = unsubscribeToken("sched-1");
    expect(verifyUnsubscribeToken("sched-1", tok)).toBe(true);
    expect(verifyUnsubscribeToken("sched-2", tok)).toBe(false);
    expect(verifyUnsubscribeToken("sched-1", "deadbeef")).toBe(false);
  });
});
