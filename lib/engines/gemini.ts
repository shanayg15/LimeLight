import { GoogleGenAI } from "@google/genai";
import { actualCallCost } from "./pricing";
import {
  normalizeDomain,
  type AnswerEngine,
  type EngineCitation,
  type EngineQueryOpts,
  type EngineResult,
} from "./types";

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

type LooseGeminiResponse = {
  text?: string;
  candidates?: {
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

/**
 * Gemini grounding returns vertexaisearch.cloud.google.com REDIRECT urls, not
 * publisher urls. Resolve each (HEAD, follow redirects) so source analytics sees
 * the real domain; fall back to the redirect url if resolution fails.
 */
async function resolveRedirects(
  raw: { uri: string; title?: string }[],
): Promise<EngineCitation[]> {
  const resolved = await Promise.all(
    raw.map(async (r) => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(r.uri, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
        clearTimeout(timer);
        return { url: res.url || r.uri, title: r.title };
      } catch {
        return { url: r.uri, title: r.title };
      }
    }),
  );

  const seen = new Set<string>();
  const out: EngineCitation[] = [];
  let rank = 1;
  for (const r of resolved) {
    const domain = normalizeDomain(r.url);
    if (!domain) continue;
    // Drop unresolved redirects: a vertexaisearch host has no real publisher
    // domain, so including it would pollute source analytics. Better to omit it.
    if (domain.includes("vertexaisearch.cloud.google.com")) continue;
    const key = r.url.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: r.url.trim(), domain, title: r.title, rank: rank++ });
  }
  return out;
}

export const GeminiEngine: AnswerEngine = {
  id: "gemini",
  async query(prompt: string, opts: EngineQueryOpts): Promise<EngineResult> {
    const ai = new GoogleGenAI({ apiKey: opts.apiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], temperature: opts.temperature },
    });

    const text = response.text ?? ""; // typed getter (concatenates text parts)
    const r = response as unknown as LooseGeminiResponse;
    const gm = r.candidates?.[0]?.groundingMetadata;
    const chunks = gm?.groundingChunks ?? [];
    const raw = chunks
      .filter((c) => c.web?.uri)
      .map((c) => ({ uri: c.web!.uri!, title: c.web!.title }));
    const citations = await resolveRedirects(raw);

    const tokensIn = r.usageMetadata?.promptTokenCount;
    const tokensOut = r.usageMetadata?.candidatesTokenCount;
    return {
      text,
      citations,
      model: GEMINI_MODEL,
      // groundingMetadata is only present when grounding actually fired.
      searchEnabled: Boolean(gm),
      tokensIn,
      tokensOut,
      costUsd: actualCallCost("gemini", tokensIn ?? 0, tokensOut ?? 0),
    };
  },
};
