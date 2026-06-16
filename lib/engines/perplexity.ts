import { actualCallCost } from "./pricing";
import {
  normalizeDomain,
  type AnswerEngine,
  type EngineCitation,
  type EngineQueryOpts,
  type EngineResult,
} from "./types";

const ENDPOINT = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_MODEL = process.env.PERPLEXITY_MODEL ?? "sonar";

type PplxSearchResult = { title?: string; url: string; date?: string | null };
export type PplxResponse = {
  choices?: { message?: { content?: string } }[];
  // REAL sources live here (the legacy top-level `citations` string[] is deprecated).
  search_results?: PplxSearchResult[];
  citations?: string[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * Map a Perplexity response's `search_results` to normalized citations.
 * NEVER parses URLs out of prose; a response with no search_results → []. Exported
 * for deterministic eval against saved fixtures.
 */
export function mapPerplexityCitations(data: PplxResponse): EngineCitation[] {
  const results = data.search_results;
  if (!results || results.length === 0) return [];
  const seen = new Set<string>();
  const out: EngineCitation[] = [];
  let rank = 1;
  for (const r of results) {
    if (!r?.url) continue;
    const domain = normalizeDomain(r.url);
    if (!domain) continue;
    const key = r.url.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: r.url.trim(), domain, title: r.title, rank: rank++ });
  }
  return out;
}

export class EngineHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "EngineHttpError";
    this.status = status;
  }
}

export const PerplexityEngine: AnswerEngine = {
  id: "perplexity",
  async query(prompt: string, opts: EngineQueryOpts): Promise<EngineResult> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: opts.temperature,
        web_search_options: { search_context_size: "low" },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new EngineHttpError(res.status, `Perplexity ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as PplxResponse;
    const text = data.choices?.[0]?.message?.content ?? "";
    const citations = mapPerplexityCitations(data);
    const tokensIn = data.usage?.prompt_tokens;
    const tokensOut = data.usage?.completion_tokens;

    return {
      text,
      citations,
      model: PERPLEXITY_MODEL,
      searchEnabled: true, // sonar always runs a web search
      tokensIn,
      tokensOut,
      costUsd: actualCallCost("perplexity", tokensIn ?? 0, tokensOut ?? 0),
    };
  },
};
