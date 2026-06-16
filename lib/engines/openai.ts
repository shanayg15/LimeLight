import OpenAI from "openai";
import { actualCallCost } from "./pricing";
import {
  normalizeDomain,
  type AnswerEngine,
  type EngineCitation,
  type EngineQueryOpts,
  type EngineResult,
} from "./types";

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1";

// Loose view of the Responses output (avoids fighting the SDK's discriminated union).
type LooseAnnotation = { type?: string; url?: string; title?: string };
type LoosePart = { type?: string; annotations?: LooseAnnotation[] };
type LooseItem = { type?: string; content?: LoosePart[] };
type LooseResponse = {
  output_text?: string;
  output?: LooseItem[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

export const OpenAIEngine: AnswerEngine = {
  id: "openai",
  async query(prompt: string, opts: EngineQueryOpts): Promise<EngineResult> {
    const client = new OpenAI({ apiKey: opts.apiKey });
    const response = await client.responses.create({
      model: OPENAI_MODEL,
      tools: [{ type: "web_search" }],
      input: prompt,
      temperature: opts.temperature,
    });

    const r = response as unknown as LooseResponse;
    const text = r.output_text ?? "";

    const citations: EngineCitation[] = [];
    const seen = new Set<string>();
    let rank = 1;
    let searched = false;

    for (const item of r.output ?? []) {
      if (item.type === "web_search_call") searched = true;
      if (item.type !== "message") continue;
      for (const part of item.content ?? []) {
        if (part.type !== "output_text") continue;
        for (const ann of part.annotations ?? []) {
          if (ann.type !== "url_citation" || !ann.url) continue;
          const domain = normalizeDomain(ann.url);
          if (!domain) continue;
          const key = ann.url.trim().toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          citations.push({ url: ann.url.trim(), domain, title: ann.title, rank: rank++ });
        }
      }
    }

    const tokensIn = r.usage?.input_tokens;
    const tokensOut = r.usage?.output_tokens;
    return {
      text,
      citations,
      model: OPENAI_MODEL,
      searchEnabled: searched, // the model actually invoked web_search
      tokensIn,
      tokensOut,
      costUsd: actualCallCost("openai", tokensIn ?? 0, tokensOut ?? 0),
    };
  },
};
