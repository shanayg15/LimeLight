import { z } from "zod";
import { eq } from "drizzle-orm";
import type { ContentKind, FaqItem, Subject } from "@/lib/db/schema";
import { extractJsonObject, JsonArrayParseError } from "@/lib/core/json";
import { generateSchema, type SchemaSubject } from "@/lib/schema";
import type { RetrievedChunk } from "@/lib/core/embeddings";

/**
 * Content generation (M6). Turns a Create/Improve opportunity into a brand-aware
 * draft (article + FAQ + VALID JSON-LD), grounded in retrieved facts. Pure
 * assemblers (parseGeneratedContent / buildScaffold / assembleDraft) are
 * eval-tested with fixtures; generateContent() does the IO and calls them.
 *
 * Honesty: the model is told to ground in retrieved facts + the subject's own
 * description and NEVER invent facts about a real person/product. With no key we
 * emit a clearly-labeled scaffold that contains no invented facts at all.
 */

export class ContentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentParseError";
  }
}

export type OpportunitySeed = {
  id: string;
  kind: ContentKind;
  title: string;
  targetTopic?: string | null;
  weakPrompts: string[];
};

const GeneratedContentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  articleMd: z.string().trim().min(1),
  answers: z
    .array(z.object({ question: z.string().trim().min(1), answer: z.string().trim().min(1) }))
    .default([]),
});
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

/** Defensive parse of the generation model's JSON object (fences/prose tolerated). */
export function parseGeneratedContent(raw: string): GeneratedContent {
  let obj: Record<string, unknown>;
  try {
    obj = extractJsonObject(raw);
  } catch (e) {
    throw new ContentParseError(e instanceof JsonArrayParseError ? e.message : "Unparseable content.");
  }
  const result = GeneratedContentSchema.safeParse(obj);
  if (!result.success) throw new ContentParseError("Content JSON missing required fields.");
  return result.data;
}

/**
 * FAQ questions are ALWAYS the real weak prompts. Answers come from the model
 * (matched by question) or, if missing, a clearly-marked placeholder — never a
 * fabricated fact.
 */
function buildFaq(weakPrompts: string[], answers: { question: string; answer: string }[]): FaqItem[] {
  const byQ = new Map(answers.map((a) => [a.question.trim().toLowerCase(), a.answer.trim()]));
  return weakPrompts
    .map((q) => q.trim())
    .filter(Boolean)
    .map((question) => ({
      question,
      answer: byQ.get(question.toLowerCase()) || "Answer this directly from your own experience and facts.",
    }));
}

const SCAFFOLD_NOTE =
  "_Draft scaffold generated without a model — replace the prompts below with your own real facts before publishing. Limelight never invents facts about you._";

/** Keyless scaffold: structure + the user's own description + retrieved themes. NO invented facts. */
export function buildScaffold(
  subject: { name: string; description?: string | null; brandVoice?: string | null },
  opp: OpportunitySeed,
  retrieved: Pick<RetrievedChunk, "content">[],
): { title: string; articleMd: string; faq: FaqItem[] } {
  const title = opp.title.replace(/^(Publish content answering|Upgrade your .*? page so AI cites you for)\s*/i, "").trim() || opp.title;
  const intro = subject.description?.trim()
    ? subject.description.trim()
    : `Write an answer-first introduction about ${subject.name}.`;
  const themes = retrieved
    .slice(0, 4)
    .map((r) => `- Cover: ${r.content.slice(0, 120).trim()}…`)
    .join("\n");

  const articleMd = [
    `# ${title}`,
    "",
    SCAFFOLD_NOTE,
    "",
    intro,
    "",
    "## What to cover",
    themes || "- Outline the key points a reader (and an AI assistant) needs to know.",
    "",
    "## Questions to answer directly",
    ...opp.weakPrompts.map((p) => `- ${p}`),
    "",
    "## Summary",
    `Close with a concise verdict that an answer engine can quote about ${subject.name}.`,
  ].join("\n");

  return { title, articleMd, faq: buildFaq(opp.weakPrompts, []) };
}

/** Assemble the final draft (article + FAQ + validated JSON-LD) from a generation result or a scaffold. */
export function assembleDraft(
  subject: SchemaSubject & { brandVoice?: string | null },
  opp: OpportunitySeed,
  gen: GeneratedContent | null,
  retrieved: Pick<RetrievedChunk, "content">[],
): { title: string; bodyMd: string; faq: FaqItem[]; jsonLd: unknown; validationErrors: string[]; source: "model" | "scaffold" } {
  let title: string;
  let bodyMd: string;
  let faq: FaqItem[];
  let source: "model" | "scaffold";

  if (gen) {
    title = gen.title;
    bodyMd = gen.articleMd;
    faq = buildFaq(opp.weakPrompts, gen.answers);
    source = "model";
  } else {
    const scaffold = buildScaffold(subject, opp, retrieved);
    title = scaffold.title;
    bodyMd = scaffold.articleMd;
    faq = scaffold.faq;
    source = "scaffold";
  }

  const { jsonLd, validation } = generateSchema(subject, { title, faq });
  return { title, bodyMd, faq, jsonLd, validationErrors: validation.errors, source };
}

// ── Generation prompt ─────────────────────────────────────────────────────

function buildContentPrompt(
  subject: { name: string; type: string; description?: string | null; brandVoice?: string | null },
  opp: OpportunitySeed,
  retrieved: Pick<RetrievedChunk, "content" | "sourceType" | "url">[],
): { system: string; prompt: string } {
  const system = [
    "You write AEO-optimized content that earns citations in AI answers (ChatGPT, Claude, Gemini, Perplexity).",
    "GROUND every factual claim in the RETRIEVED CONTEXT and the subject's own description. This subject is a REAL person/business/product — NEVER invent facts, credentials, stats, awards, quotes, or affiliations. If the facts are thin, write less rather than fabricate.",
    "Match the brand voice if given. Write a clear H1, an answer-first opening paragraph, scannable sections, and a short verdict/summary.",
    "Answer EACH provided question concisely and factually (these are the questions people actually ask AI about the subject).",
    'Return ONLY a strict JSON object: {"title": string, "articleMd": string (markdown), "answers": [{"question": string (verbatim from the list), "answer": string}]}. No prose, no markdown fences around the JSON.',
  ].join("\n");

  const ctx = retrieved.length
    ? retrieved.map((r, i) => `[${i + 1}] (${r.sourceType}) ${r.url}\n${r.content.slice(0, 700)}`).join("\n\n")
    : "(no retrieved context — rely only on the subject description; keep claims minimal)";

  const prompt = [
    `SUBJECT: ${subject.name} (${subject.type})`,
    subject.description ? `DESCRIPTION: ${subject.description}` : "DESCRIPTION: (none provided)",
    subject.brandVoice ? `BRAND VOICE: ${subject.brandVoice}` : "",
    opp.targetTopic ? `TARGET TOPIC: ${opp.targetTopic}` : "",
    `GOAL: ${opp.title}`,
    "",
    "QUESTIONS TO ANSWER (use each verbatim as a FAQ question):",
    ...opp.weakPrompts.map((p) => `- ${p}`),
    "",
    "RETRIEVED CONTEXT (ground claims in this; do not contradict or go beyond it):",
    ctx,
    "",
    "Return the JSON object now.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}

// ── The verb (IO) ───────────────────────────────────────────────────────────

const MAX_OWN_PAGES = 5;
const MAX_CITED_PAGES = 3;
const MAX_WEAK_PROMPTS = 6;

/**
 * Generate + persist a content draft for an opportunity. Crawls the user's own
 * pages + top cited pages (politely, reusing M5's crawler), ingests embeddings,
 * retrieves grounding, generates (or scaffolds keyless), validates schema, saves.
 */
export async function generateContent(subjectId: string, opportunityId: string): Promise<string> {
  const { db } = await import("@/lib/db/client");
  const { subjects, contentDrafts } = await import("@/lib/db/schema");
  const { getOpportunitiesForSubject } = await import("@/lib/core/content-context");
  const { getProviderKey } = await import("@/lib/core/keys");
  const { generateText, hasGenerationKey } = await import("@/lib/generation/client");
  const { ingestPages, retrieveChunks } = await import("@/lib/core/embeddings");
  const { gatherGroundingPages } = await import("@/lib/core/content-context");

  const [subject] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!subject) throw new Error("Subject not found.");

  // Resolve the opportunity from current data (don't trust client-passed details).
  const opps = await getOpportunitiesForSubject(subjectId);
  const found = opps.find((o) => o.id === opportunityId);
  if (!found || (found.kind !== "create" && found.kind !== "improve")) {
    throw new Error("That opportunity can't be drafted (only Create/Improve produce content).");
  }

  const weakPrompts = (found.evidence.prompts ?? []).slice(0, MAX_WEAK_PROMPTS);
  // Backfill questions from the subject's prompts on the topic if the gap had few.
  if (weakPrompts.length === 0) {
    const { prompts } = await import("@/lib/db/schema");
    const rows = await db.select({ text: prompts.text }).from(prompts).where(eq(prompts.subjectId, subjectId));
    weakPrompts.push(...rows.slice(0, 3).map((r) => r.text));
  }

  const opp: OpportunitySeed = {
    id: found.id,
    kind: found.kind,
    title: found.title,
    targetTopic: found.targetTopic ?? null,
    weakPrompts,
  };

  const openaiKey = await getProviderKey(subject.userId, "openai");

  // Ground: own pages + top cited pages for the topic.
  const pages = await gatherGroundingPages(subject as Subject, found, {
    maxOwnPages: MAX_OWN_PAGES,
    maxCitedPages: MAX_CITED_PAGES,
  });
  if (pages.length > 0) {
    await ingestPages(subjectId, pages, openaiKey).catch(() => ({ chunks: 0, embedded: false }));
  }
  const retrieved = await retrieveChunks(subjectId, `${opp.targetTopic ?? ""} ${opp.title} ${weakPrompts.join(" ")}`, {
    k: 6,
    apiKey: openaiKey,
  }).catch(() => []);

  const schemaSubject: SchemaSubject & { brandVoice?: string | null } = {
    name: subject.name,
    type: subject.type as SchemaSubject["type"],
    description: subject.description,
    siteUrl: subject.siteUrl,
    aliases: subject.aliases,
    brandVoice: subject.brandVoice,
  };

  // Generate (model) or scaffold (keyless), never throwing to the caller.
  let gen: GeneratedContent | null = null;
  if (hasGenerationKey()) {
    const { system, prompt } = buildContentPrompt(schemaSubject, opp, retrieved);
    const attempt = async (extra?: string) =>
      parseGeneratedContent(await generateText({ system, prompt: extra ? `${prompt}\n\n${extra}` : prompt, maxTokens: 4096 }));
    try {
      try {
        gen = await attempt();
      } catch (e) {
        if (!(e instanceof ContentParseError)) throw e;
        gen = await attempt("Your previous reply could not be parsed. Reply with ONLY the JSON object.");
      }
    } catch {
      gen = null; // degrade to scaffold — never block the UI
    }
  }

  const assembled = assembleDraft(schemaSubject, opp, gen, retrieved);

  const [row] = await db
    .insert(contentDrafts)
    .values({
      subjectId,
      opportunityId: opp.id,
      kind: opp.kind,
      title: assembled.title,
      bodyMd: assembled.bodyMd,
      faq: assembled.faq,
      jsonLd: assembled.jsonLd,
      status: "draft",
      targetTopic: opp.targetTopic,
      source: assembled.source,
    })
    .returning({ id: contentDrafts.id });
  return row.id;
}
