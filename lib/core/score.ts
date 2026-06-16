import type { AuditScores, EngineId } from "@/lib/db/schema";

/** One model response, reduced to the fields scoring needs. */
export type ScoreResponseInput = {
  promptId: string;
  engine: EngineId;
  /** True if the engine call failed — excluded from all metrics. */
  failed: boolean;
  /** Was the SUBJECT mentioned in this response (after disambiguation)? */
  subjectMentioned: boolean;
  /** Subject's position among named entities (1 = first); null if not mentioned. */
  subjectPosition: number | null;
  /** How many competitor targets were mentioned in this response. */
  competitorMentionedCount: number;
  /** Did this response cite the subject's own domain? */
  citedSubjectDomain: boolean;
};

export type ScoreInput = {
  hasCompetitors: boolean;
  responses: ScoreResponseInput[];
};

/**
 * Compute the headline visibility metrics. Pure + deterministic so it's
 * eval-tested for free. Formulas are surfaced in the UI:
 *  - visibilityScore  = prompts with ≥1 subject mention ÷ promptCount
 *  - shareOfVoice     = subject ÷ (subject + competitor mentions); null if no competitors
 *  - avgPosition      = mean of non-null subject positions
 *  - citationFrequency= prompts citing the subject's own domain ÷ promptCount
 */
export function scoreVisibility(input: ScoreInput): AuditScores {
  const { hasCompetitors } = input;
  // Exclude failed engine calls — a failed call is not "ran but didn't mention you".
  const responses = input.responses.filter((r) => !r.failed);
  // Effective denominator: prompts with ≥1 successful response (handles partial / cost-capped runs).
  const promptCount = new Set(responses.map((r) => r.promptId)).size;

  const subjectMentionCount = responses.filter((r) => r.subjectMentioned).length;
  const competitorMentionCount = responses.reduce((s, r) => s + r.competitorMentionedCount, 0);

  // Visibility is PER-PROMPT (consistent with citationFrequency): a prompt counts
  // if the subject is mentioned in ≥1 of its samples.
  const promptsMentioned = new Set(
    responses.filter((r) => r.subjectMentioned).map((r) => r.promptId),
  );
  const visibilityScore = promptCount === 0 ? 0 : promptsMentioned.size / promptCount;

  const denom = subjectMentionCount + competitorMentionCount;
  const shareOfVoice = !hasCompetitors ? null : denom === 0 ? 0 : subjectMentionCount / denom;

  const positions = responses
    .map((r) => r.subjectPosition)
    .filter((p): p is number => p != null && Number.isFinite(p));
  const avgPosition =
    positions.length === 0 ? null : positions.reduce((a, b) => a + b, 0) / positions.length;

  const promptsCitingSubject = new Set(
    responses.filter((r) => r.citedSubjectDomain).map((r) => r.promptId),
  );
  const citationFrequency = promptCount === 0 ? 0 : promptsCitingSubject.size / promptCount;

  // Per-engine: % of the prompts that engine ran where the subject is mentioned.
  const engineIds = [...new Set(responses.map((r) => r.engine))];
  const perEngine = engineIds.map((engine) => {
    const er = responses.filter((r) => r.engine === engine);
    const ran = new Set(er.map((r) => r.promptId));
    const mentioned = new Set(er.filter((r) => r.subjectMentioned).map((r) => r.promptId));
    return {
      engine,
      visibilityScore: ran.size === 0 ? 0 : mentioned.size / ran.size,
      promptsMentioned: mentioned.size,
      promptCount: ran.size,
    };
  });

  return {
    visibilityScore,
    promptsMentionedCount: promptsMentioned.size,
    perEngine,
    shareOfVoice,
    avgPosition,
    citationFrequency,
    promptCount,
    subjectMentionCount,
    competitorMentionCount,
    hasCompetitors,
  };
}
