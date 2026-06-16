import { z } from "zod";
import { extractJsonArray, JsonArrayParseError } from "@/lib/core/json";
import { generateText, hasGenerationKey } from "@/lib/generation/client";

export const DETECTION_MODEL = process.env.DETECTION_MODEL ?? "claude-haiku-4-5";

export type DetectTarget = {
  key: string; // "subject" or a competitor id — round-trips through the model
  targetType: "subject" | "competitor";
  targetId: string;
  name: string;
  aliases: string[];
  description?: string | null;
  siteUrl?: string | null;
};

export type MentionResult = {
  targetType: "subject" | "competitor";
  targetId: string;
  mentioned: boolean;
  position: number | null;
  sentiment: "positive" | "neutral" | "negative";
  snippet: string;
  confidence: number; // 0–1
  /** Method that produced this — 'model' (disambiguated) or 'heuristic' (keyless). */
  method: "model" | "heuristic";
};

const DetectItemSchema = z.object({
  key: z.string(),
  mentioned: z.boolean(),
  position: z.number().int().positive().nullable().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  snippet: z.string().max(600).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const MAX_ANSWER_CHARS = 6000;

// ── Defensive parse + mapping (eval-tested against saved detection responses) ──

/**
 * Map a detection-model response onto the target list. The TARGETS drive the
 * output (one MentionResult per target), so missing/invalid model items default
 * to mentioned=false rather than dropping a target. Throws JsonArrayParseError
 * only when no array can be recovered (caller retries).
 */
export function parseDetection(raw: string, targets: DetectTarget[]): MentionResult[] {
  const items = extractJsonArray(raw); // throws on truly malformed -> retry
  const byKey = new Map<string, z.infer<typeof DetectItemSchema>>();
  for (const item of items) {
    const parsed = DetectItemSchema.safeParse(item);
    if (parsed.success) byKey.set(parsed.data.key, parsed.data);
  }

  return targets.map((t) => {
    const m = byKey.get(t.key);
    if (!m || !m.mentioned) {
      return {
        targetType: t.targetType,
        targetId: t.targetId,
        mentioned: false,
        position: null,
        sentiment: "neutral",
        snippet: "",
        confidence: m ? (m.confidence ?? 0.8) : 0.6,
        method: "model",
      };
    }
    return {
      targetType: t.targetType,
      targetId: t.targetId,
      mentioned: true,
      position: m.position ?? null,
      sentiment: m.sentiment ?? "neutral",
      snippet: (m.snippet ?? "").slice(0, 280),
      confidence: m.confidence ?? 0.7,
      method: "model",
    };
  });
}

// ── Keyless heuristic fallback (degraded; no disambiguation) ──────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstIndexOf(haystackLower: string, term: string): number {
  const t = term.trim().toLowerCase();
  if (!t) return -1;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(t)}([^a-z0-9]|$)`, "i");
  const m = haystackLower.match(re);
  if (!m || m.index === undefined) return -1;
  return m.index + m[1].length;
}

function snippetAround(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 40);
  return text.slice(start, Math.min(text.length, idx + len)).trim();
}

/**
 * Substring/word-boundary detection used when no generation key is set. Degraded:
 * it does NOT disambiguate name collisions and assigns neutral sentiment, so it
 * reports low confidence. The real path is the disambiguated model detection.
 */
export function heuristicDetect(text: string, targets: DetectTarget[]): MentionResult[] {
  const lower = text.toLowerCase();
  const found = targets.map((t) => {
    const terms = [t.name, ...(t.aliases ?? [])].filter(Boolean);
    let idx = -1;
    for (const term of terms) {
      const i = firstIndexOf(lower, term);
      if (i !== -1 && (idx === -1 || i < idx)) idx = i;
    }
    return { t, idx };
  });

  const mentionedSorted = found.filter((f) => f.idx !== -1).sort((a, b) => a.idx - b.idx);
  const posByKey = new Map(mentionedSorted.map((f, i) => [f.t.key, i + 1]));

  return found.map(({ t, idx }) => {
    const mentioned = idx !== -1;
    return {
      targetType: t.targetType,
      targetId: t.targetId,
      mentioned,
      position: mentioned ? (posByKey.get(t.key) ?? null) : null,
      sentiment: "neutral",
      snippet: mentioned ? snippetAround(text, idx, 120) : "",
      // Low confidence: heuristic can't disambiguate collisions.
      confidence: mentioned ? 0.45 : 0.55,
      method: "heuristic",
    };
  });
}

// ── The verb ──────────────────────────────────────────────────────────────

function buildDetectionPrompt(text: string, targets: DetectTarget[]): { system: string; prompt: string } {
  const system = [
    "You decide, for each listed entity, whether a given AI answer refers to THAT SPECIFIC entity.",
    "Watch for name collisions: a different person/product/company that happens to share the name does NOT count as a mention of the listed entity. Use the provided aliases, site, and description to disambiguate.",
    'Return ONLY a strict JSON array (no prose, no markdown fences). One object per entity key:',
    '{"key": string, "mentioned": boolean, "position": integer|null (rank among named brands/entities in the answer, 1 = named first; null if not mentioned), "sentiment": "positive"|"neutral"|"negative", "snippet": a short quote (<=200 chars) where it is referenced or "", "confidence": number 0..1}',
  ].join("\n");

  const entityLines = targets.map((t) => {
    const parts = [`key=${t.key}`, `name=${JSON.stringify(t.name)}`];
    if (t.aliases?.length) parts.push(`aliases=${JSON.stringify(t.aliases)}`);
    if (t.siteUrl) parts.push(`site=${t.siteUrl}`);
    if (t.description) parts.push(`description=${JSON.stringify(t.description)}`);
    return `- ${parts.join(" ")}`;
  });

  const prompt = [
    "ANSWER:",
    text.slice(0, MAX_ANSWER_CHARS),
    "",
    "ENTITIES:",
    ...entityLines,
    "",
    "Return the JSON array now.",
  ].join("\n");

  return { system, prompt };
}

export type DetectSubject = {
  id: string;
  name: string;
  aliases?: string[];
  description?: string | null;
  siteUrl?: string | null;
};
export type DetectCompetitor = { id: string; name: string; aliases?: string[] };

/**
 * Detect whether the subject (and each competitor, for share-of-voice) is
 * mentioned in a model answer. Disambiguated LLM extraction when a key is set;
 * keyless heuristic fallback otherwise. Never throws (audit job depends on this).
 */
export async function detectMention(
  text: string,
  subject: DetectSubject,
  competitors: DetectCompetitor[],
): Promise<MentionResult[]> {
  const targets: DetectTarget[] = [
    {
      key: "subject",
      targetType: "subject",
      targetId: subject.id,
      name: subject.name,
      aliases: subject.aliases ?? [],
      description: subject.description,
      siteUrl: subject.siteUrl,
    },
    ...competitors.map((c) => ({
      key: c.id,
      targetType: "competitor" as const,
      targetId: c.id,
      name: c.name,
      aliases: c.aliases ?? [],
    })),
  ];

  if (!text.trim() || !hasGenerationKey()) {
    return heuristicDetect(text, targets);
  }

  const { system, prompt } = buildDetectionPrompt(text, targets);
  const attempt = async (extra?: string) => {
    const raw = await generateText({
      system,
      prompt: extra ? `${prompt}\n\n${extra}` : prompt,
      model: DETECTION_MODEL,
      maxTokens: 1500,
    });
    return parseDetection(raw, targets);
  };

  try {
    try {
      return await attempt();
    } catch (err) {
      if (!(err instanceof JsonArrayParseError)) throw err;
      return await attempt("Your previous reply could not be parsed. Reply with ONLY the JSON array.");
    }
  } catch {
    // API error or second parse failure — degrade gracefully, never throw.
    return heuristicDetect(text, targets);
  }
}
