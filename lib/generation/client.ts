import Anthropic from "@anthropic-ai/sdk";

/**
 * Internal generation model (prompt-gen M2, detection M3, content-gen M6).
 * BYO key at the app level via env; per-user keys override from M4.
 * Default model is Opus 4.8 (overridable). Note: Opus 4.8 removed `temperature`
 * — steer determinism via the prompt, not a sampling param.
 */
export const GENERATION_PROVIDER = (process.env.GENERATION_PROVIDER ?? "anthropic") as
  | "anthropic"
  | "openai";

export const GENERATION_MODEL = process.env.GENERATION_MODEL ?? "claude-opus-4-8";

export class GenerationKeyMissingError extends Error {
  constructor() {
    super("No generation model API key configured.");
    this.name = "GenerationKeyMissingError";
  }
}

/** Whether a usable generation key is configured (app-level env, for now). */
export function hasGenerationKey(): boolean {
  if (GENERATION_PROVIDER === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  if (GENERATION_PROVIDER === "openai") return Boolean(process.env.OPENAI_API_KEY);
  return false;
}

/**
 * Call the generation model and return the concatenated assistant text.
 * Throws GenerationKeyMissingError if no key — callers may fall back.
 */
export async function generateText(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  /** Override the model (e.g. claude-haiku-4-5 for cheap structured extraction). */
  model?: string;
}): Promise<string> {
  if (GENERATION_PROVIDER !== "anthropic") {
    // OpenAI generation arrives alongside the OpenAI answer-engine adapter (M4).
    throw new Error(
      `GENERATION_PROVIDER='${GENERATION_PROVIDER}' is not supported yet — use 'anthropic'.`,
    );
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new GenerationKeyMissingError();

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: opts.model ?? GENERATION_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
