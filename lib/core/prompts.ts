import { z } from "zod";
import type { PromptIntent, SubjectType } from "@/lib/db/schema";
import {
  GenerationKeyMissingError,
  generateText,
  hasGenerationKey,
} from "@/lib/generation/client";

export const PROMPT_INTENTS = [
  "discovery",
  "comparison",
  "reputation",
  "how_to",
] as const satisfies readonly PromptIntent[];

/** One candidate prompt: the natural-language question + its topic + intent. */
export const GeneratedPromptSchema = z.object({
  text: z.string().trim().min(3).max(300),
  topic: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((t) => t ?? ""),
  intent: z.enum(PROMPT_INTENTS),
});
export type GeneratedPrompt = z.infer<typeof GeneratedPromptSchema>;

/** The subset of a subject needed to draft prompts (works pre-persistence too). */
export type SubjectSeed = {
  name: string;
  type: SubjectType;
  description?: string | null;
  siteUrl?: string | null;
  aliases?: string[];
  topics: string[];
  competitors?: string[];
};

export type GeneratePromptSetResult = {
  prompts: GeneratedPrompt[];
  /** 'model' = LLM-generated; 'template' = keyless deterministic fallback. */
  source: "model" | "template";
};

export class PromptParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptParseError";
  }
}

export class PromptGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptGenerationError";
  }
}

const MIN_PROMPTS = 15;
const MAX_PROMPTS = 30;

// ── Defensive parsing (the #1 failure mode: models wrap JSON in prose/fences) ──

/**
 * Parse a model response into prompts, tolerating markdown fences and stray
 * prose around a JSON array. Drops individual malformed items but keeps valid
 * ones; throws PromptParseError only when no array/valid item can be recovered
 * (so the caller can retry — it never throws to the UI directly).
 */
export function parseGeneratedPrompts(raw: string): GeneratedPrompt[] {
  if (!raw || !raw.trim()) throw new PromptParseError("Empty model response.");

  // Strip ```json ... ``` / ``` ... ``` fences — but only trust the fenced
  // content if it actually contains an array (else scan the whole text).
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence && fence[1].includes("[")) text = fence[1].trim();

  // Extract the outermost JSON array (first '[' .. last ']').
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new PromptParseError("No JSON array found in model response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new PromptParseError("Model response was not valid JSON.");
  }
  if (!Array.isArray(parsed)) throw new PromptParseError("Model response was not an array.");

  const valid: GeneratedPrompt[] = [];
  for (const item of parsed) {
    const result = GeneratedPromptSchema.safeParse(item);
    if (result.success) valid.push(result.data);
  }
  if (valid.length === 0) throw new PromptParseError("No valid prompts in model response.");
  return valid;
}

// ── Normalization, dedupe, coverage ──────────────────────────────────────

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/g, "").trim();
}

function dedupe(prompts: GeneratedPrompt[]): GeneratedPrompt[] {
  const seen = new Set<string>();
  const out: GeneratedPrompt[] = [];
  for (const p of prompts) {
    const key = normalize(p.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function mentions(prompts: GeneratedPrompt[], term: string): boolean {
  const t = term.toLowerCase();
  return prompts.some((p) => p.text.toLowerCase().includes(t));
}

// ── Template fallback (keyless) + coverage top-up ─────────────────────────

const noun: Record<SubjectType, string> = {
  person: "expert",
  business: "company",
  product: "tool",
};

/**
 * Deterministic, grounded candidate prompts from the subject alone — used when
 * no generation key is set (keyless dev/demo) and to top up coverage when the
 * model omits the subject name or a topic. These are *candidates* the user curates.
 *
 * Ordering is slice-safe: one prompt per topic FIRST (so every topic survives the
 * MAX_PROMPTS cap), then name-grounded generics, then the remaining per-topic prompts.
 */
export function templatePromptSet(seed: SubjectSeed): GeneratedPrompt[] {
  const { name, type, topics, competitors = [] } = seed;
  const n = noun[type];
  const out: GeneratedPrompt[] = [];

  // Round 1 — one discovery prompt per topic (guarantees topic coverage post-slice).
  for (const topic of topics) {
    out.push({ text: `Best ${n}s for ${topic}`, topic, intent: "discovery" });
  }

  // Name-grounded generics (the "type my name into AI" core).
  const who =
    type === "person" ? `Who is ${name}?` : type === "product" ? `Who makes ${name}?` : `What does ${name} do?`;
  const like =
    type === "person" ? `People like ${name}` : type === "product" ? `Products like ${name}` : `Companies like ${name}`;
  out.push(
    { text: who, topic: "", intent: "reputation" },
    { text: `Is ${name} any good?`, topic: "", intent: "reputation" },
    { text: `${name} reviews`, topic: "", intent: "reputation" },
    { text: `What is ${name} known for?`, topic: "", intent: "reputation" },
    { text: `Is ${name} worth it?`, topic: "", intent: "reputation" },
    { text: `${name} pros and cons`, topic: "", intent: "reputation" },
    { text: `${name} explained`, topic: "", intent: "reputation" },
    { text: `What can ${name} do?`, topic: "", intent: "discovery" },
    { text: `${name} use cases`, topic: "", intent: "discovery" },
    { text: like, topic: "", intent: "discovery" },
    { text: `Alternatives to ${name}`, topic: "", intent: "comparison" },
  );

  // Round 2 — the rest of each topic's prompts.
  for (const topic of topics) {
    out.push({
      text: type === "person" ? `Who are the top ${topic} experts?` : `Top ${topic} ${n}s`,
      topic,
      intent: "discovery",
    });
    out.push({ text: `${name} ${topic}`, topic, intent: "discovery" });
    out.push({ text: `How to get started with ${topic}`, topic, intent: "how_to" });
  }

  // Provided competitors only — never invent names.
  for (const c of competitors) {
    out.push({ text: `${c} vs ${name}`, topic: "", intent: "comparison" });
  }

  return dedupe(out);
}

/**
 * Ensure the subject name and every topic appear in ≥1 prompt and the set sits
 * in [MIN, MAX]. Coverage prompts are protected from the MAX cap (collected
 * separately and re-appended after trimming) so a long model response can't
 * silently drop name/topic coverage.
 */
function ensureCoverage(prompts: GeneratedPrompt[], seed: SubjectSeed): GeneratedPrompt[] {
  const base = dedupe(prompts);
  const template = templatePromptSet(seed);
  const has = (list: GeneratedPrompt[], t: GeneratedPrompt) =>
    list.some((p) => normalize(p.text) === normalize(t.text));

  // Coverage the model omitted (name + each missing topic) — must survive the cap.
  const coverage: GeneratedPrompt[] = [];
  if (!mentions(base, seed.name)) {
    const t = template.find((p) => p.text.includes(seed.name));
    if (t && !has(base, t)) coverage.push(t);
  }
  for (const topic of seed.topics) {
    if (!mentions(base, topic) && !mentions(coverage, topic)) {
      const t = template.find((p) => p.topic === topic);
      if (t && !has(base, t) && !has(coverage, t)) coverage.push(t);
    }
  }

  // Pad toward MIN with remaining template prompts (counting reserved coverage).
  const padded = [...base];
  for (const t of template) {
    if (padded.length + coverage.length >= MIN_PROMPTS) break;
    if (!has(padded, t) && !has(coverage, t)) padded.push(t);
  }

  // Fit within MAX while keeping all coverage prompts.
  const room = Math.max(0, MAX_PROMPTS - coverage.length);
  return dedupe([...padded.slice(0, room), ...coverage]);
}

// ── Prompt construction for the model ─────────────────────────────────────

function buildGenerationPrompt(seed: SubjectSeed): { system: string; prompt: string } {
  const typeGuidance: Record<SubjectType, string> = {
    person:
      "This is a PERSON. Favor reputation ('who is X', 'is X legit') and discovery ('best <topic> experts', 'X's work on <topic>') prompts. Avoid product-comparison framing.",
    business:
      "This is a SOLO BUSINESS. Mix reputation ('is X any good', 'X reviews'), discovery ('best <topic> companies'), and comparison prompts.",
    product:
      "This is a PRODUCT. Favor discovery ('best <topic> tools'), comparison ('alternatives to X', '<competitor> vs X'), and how-to prompts.",
  };

  const system = [
    "You generate the natural-language questions a real person would type into AI assistants (ChatGPT, Claude, Gemini, Perplexity) that could surface a given subject.",
    "Return ONLY a strict JSON array — no prose, no markdown fences. Each element: {\"text\": string, \"topic\": string, \"intent\": one of \"discovery\"|\"comparison\"|\"reputation\"|\"how_to\"}.",
    "Cover the intent mix. Ground every prompt in the subject's topics/description — never vague 'best tools' with no category.",
    "Do NOT invent competitor names that were not provided (generic 'alternatives to X' is fine).",
    "Produce 18–26 distinct prompts. The subject's name must appear in at least one prompt, and each topic in at least one prompt.",
  ].join("\n");

  const lines: string[] = [
    `Name: ${seed.name}`,
    `Type: ${seed.type}`,
    typeGuidance[seed.type],
  ];
  if (seed.description) lines.push(`Description: ${seed.description}`);
  if (seed.siteUrl) lines.push(`Site: ${seed.siteUrl}`);
  if (seed.aliases?.length) lines.push(`Also known as: ${seed.aliases.join(", ")}`);
  lines.push(`Topics: ${seed.topics.join(", ")}`);
  if (seed.competitors?.length) lines.push(`Competitors (only these may be named): ${seed.competitors.join(", ")}`);
  lines.push("", "Return the JSON array now.");

  return { system, prompt: lines.join("\n") };
}

// ── The verb ──────────────────────────────────────────────────────────────

/**
 * Draft a curated candidate prompt set for a subject. Uses the generation model
 * when a key is set (defensive parse + Zod + one retry), otherwise a deterministic
 * template fallback. Always returns 15–30 deduped, coverage-checked prompts.
 * Does NOT call any answer engine — that is M3's fanOut.
 */
export async function generatePromptSet(seed: SubjectSeed): Promise<GeneratePromptSetResult> {
  if (!hasGenerationKey()) {
    return { prompts: ensureCoverage(templatePromptSet(seed), seed), source: "template" };
  }

  const { system, prompt } = buildGenerationPrompt(seed);

  const attempt = async (extra?: string): Promise<GeneratedPrompt[]> => {
    const raw = await generateText({
      system,
      prompt: extra ? `${prompt}\n\n${extra}` : prompt,
      maxTokens: 4096,
    });
    return parseGeneratedPrompts(raw);
  };

  try {
    let parsed: GeneratedPrompt[];
    try {
      parsed = await attempt();
    } catch (err) {
      if (!(err instanceof PromptParseError)) throw err;
      // One corrective retry — the single most common failure is fences/prose.
      parsed = await attempt(
        "Your previous output could not be parsed. Reply with ONLY the JSON array — no prose, no markdown fences.",
      );
    }
    return { prompts: ensureCoverage(parsed, seed), source: "model" };
  } catch (err) {
    if (err instanceof GenerationKeyMissingError) {
      return { prompts: ensureCoverage(templatePromptSet(seed), seed), source: "template" };
    }
    throw new PromptGenerationError(
      "Could not generate prompts from the model. Check your API key in Settings and try again.",
    );
  }
}
