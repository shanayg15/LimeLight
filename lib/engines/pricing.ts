import type { EngineId } from "@/lib/db/schema";

/**
 * Per-provider pricing for cost ESTIMATES (USD). Token rates are per-million;
 * `searchPerRequest` is the amortized search/grounding fee per call. These are
 * approximations for pre-run estimates and budget caps — not billing.
 * (Verified mid-2026; see lib/engines adapters. M4 wires the non-Perplexity ones.)
 */
type Pricing = {
  defaultModel: string;
  inputPerMTok: number;
  outputPerMTok: number;
  searchPerRequest: number;
};

export const ENGINE_PRICING: Record<EngineId, Pricing> = {
  // sonar: $1/$1 per MTok + $5 per 1000 low-context searches.
  perplexity: { defaultModel: "sonar", inputPerMTok: 1, outputPerMTok: 1, searchPerRequest: 0.005 },
  // gpt-4.1 + web_search (~$10 per 1000 calls). M4.
  openai: { defaultModel: "gpt-4.1", inputPerMTok: 2, outputPerMTok: 8, searchPerRequest: 0.01 },
  // gemini-2.5-flash + grounding ($35 per 1000 grounded prompts). M4.
  gemini: { defaultModel: "gemini-2.5-flash", inputPerMTok: 0.3, outputPerMTok: 2.5, searchPerRequest: 0.035 },
  // claude-haiku-4-5 + web search ($10 per 1000 searches). M4.
  claude: { defaultModel: "claude-haiku-4-5", inputPerMTok: 1, outputPerMTok: 5, searchPerRequest: 0.01 },
};

// Rough token assumptions for a pre-run estimate (no token counts available yet).
const ASSUMED_INPUT_TOKENS = 60;
const ASSUMED_OUTPUT_TOKENS: Record<EngineId, number> = {
  perplexity: 450,
  openai: 450,
  gemini: 450,
  claude: 450,
};

/** Estimated cost of a single engine call, before the run. */
export function estimateCallCost(engine: EngineId): number {
  const p = ENGINE_PRICING[engine];
  return (
    (ASSUMED_INPUT_TOKENS / 1_000_000) * p.inputPerMTok +
    (ASSUMED_OUTPUT_TOKENS[engine] / 1_000_000) * p.outputPerMTok +
    p.searchPerRequest
  );
}

/** Actual cost of a call from real token counts. */
export function actualCallCost(engine: EngineId, tokensIn: number, tokensOut: number): number {
  const p = ENGINE_PRICING[engine];
  return (
    (tokensIn / 1_000_000) * p.inputPerMTok +
    (tokensOut / 1_000_000) * p.outputPerMTok +
    p.searchPerRequest
  );
}

/** Pre-run estimate for a full audit: prompts × engines × samples. */
export function estimateAuditCost(promptCount: number, engines: EngineId[], samples: number): number {
  return engines.reduce((sum, e) => sum + estimateCallCost(e) * promptCount * samples, 0);
}

/** Pre-run cap check: true if the estimate exceeds the cap (null cap = no cap). */
export function exceedsRunCap(
  promptCount: number,
  engines: EngineId[],
  samples: number,
  capUsd: number | null | undefined,
): boolean {
  if (capUsd == null) return false;
  return estimateAuditCost(promptCount, engines, samples) > capUsd;
}
