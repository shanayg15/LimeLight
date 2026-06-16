import { describe, expect, it } from "vitest";
import { scoreVisibility, type ScoreResponseInput } from "@/lib/core/score";

// Known fixture: subject + competitors, 4 prompts (1 sample each).
const RESPONSES: ScoreResponseInput[] = [
  { promptId: "p1", engine: "perplexity", failed: false, subjectMentioned: true, subjectPosition: 1, competitorMentionedCount: 1, citedSubjectDomain: true },
  { promptId: "p2", engine: "perplexity", failed: false, subjectMentioned: true, subjectPosition: 2, competitorMentionedCount: 2, citedSubjectDomain: false },
  { promptId: "p3", engine: "perplexity", failed: false, subjectMentioned: false, subjectPosition: null, competitorMentionedCount: 1, citedSubjectDomain: false },
  { promptId: "p4", engine: "perplexity", failed: false, subjectMentioned: false, subjectPosition: null, competitorMentionedCount: 0, citedSubjectDomain: false },
];

describe("scoreVisibility — formulas", () => {
  it("computes visibility, SoV, avg position, and citation frequency", () => {
    const s = scoreVisibility({ hasCompetitors: true, responses: RESPONSES });

    // 2 of 4 prompts mention the subject (per-prompt)
    expect(s.visibilityScore).toBeCloseTo(0.5, 5);
    expect(s.promptsMentionedCount).toBe(2);
    // subject mentions = 2, competitor mentions = 1+2+1+0 = 4 -> 2/(2+4)
    expect(s.shareOfVoice).toBeCloseTo(2 / 6, 5);
    // positions 1 and 2 -> mean 1.5
    expect(s.avgPosition).toBeCloseTo(1.5, 5);
    // 1 of 4 prompts cites the subject's domain
    expect(s.citationFrequency).toBeCloseTo(0.25, 5);
    expect(s.subjectMentionCount).toBe(2);
    expect(s.competitorMentionCount).toBe(4);
    // single engine -> one per-engine row matching the headline
    expect(s.perEngine).toHaveLength(1);
    expect(s.perEngine[0]).toMatchObject({ engine: "perplexity", promptsMentioned: 2, promptCount: 4 });
  });

  it("share of voice is null without competitors", () => {
    const s = scoreVisibility({
      hasCompetitors: false,
      responses: [
        { promptId: "p1", engine: "perplexity", failed: false, subjectMentioned: true, subjectPosition: 1, competitorMentionedCount: 0, citedSubjectDomain: false },
        { promptId: "p2", engine: "perplexity", failed: false, subjectMentioned: false, subjectPosition: null, competitorMentionedCount: 0, citedSubjectDomain: false },
      ],
    });
    expect(s.shareOfVoice).toBeNull();
    expect(s.visibilityScore).toBeCloseTo(0.5, 5);
  });

  it("handles a run with zero responses", () => {
    const s = scoreVisibility({ hasCompetitors: false, responses: [] });
    expect(s.visibilityScore).toBe(0);
    expect(s.avgPosition).toBeNull();
    expect(s.citationFrequency).toBe(0);
  });
});
