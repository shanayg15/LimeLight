import type { EngineId } from "@/lib/db/schema";
import type { AnswerEngine } from "./types";
import { PerplexityEngine } from "./perplexity";
import { OpenAIEngine } from "./openai";
import { GeminiEngine } from "./gemini";
import { ClaudeEngine } from "./claude";

/** All four search/grounding-enabled answer engines. */
export const ENGINES: Partial<Record<EngineId, AnswerEngine>> = {
  perplexity: PerplexityEngine,
  openai: OpenAIEngine,
  gemini: GeminiEngine,
  claude: ClaudeEngine,
};

export function getEngine(id: EngineId): AnswerEngine | null {
  return ENGINES[id] ?? null;
}

export const ALL_ENGINE_IDS: EngineId[] = ["perplexity", "openai", "gemini", "claude"];
