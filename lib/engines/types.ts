import type { EngineId } from "@/lib/db/schema";

export type EngineCitation = {
  url: string;
  domain: string;
  title?: string;
  rank: number;
};

export type EngineResult = {
  text: string;
  citations: EngineCitation[];
  model: string;
  /** True only if this call used a real search/grounding path (real sources). */
  searchEnabled: boolean;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
};

export type EngineQueryOpts = {
  samples: number; // informational; query() runs ONE sample, fanOut owns sampling
  temperature: number;
  apiKey: string;
};

export interface AnswerEngine {
  id: EngineId;
  /** Run ONE sample. Must use the provider's search/grounding path for real citations. */
  query(prompt: string, opts: EngineQueryOpts): Promise<EngineResult>;
}

/** Normalize a URL's host: lowercase, strip a leading `www.`. Null if unparseable. */
export function normalizeDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}
