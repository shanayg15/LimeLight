/**
 * Fixtures for the content-generation evals: a subject, retrieved grounding
 * facts, the weak prompts that become FAQ questions, and a SAVED generation
 * response. FORBIDDEN_FACT is a planted fabricated credential that must never
 * appear in any output (model-assembled or keyless scaffold).
 */
import type { SchemaSubject } from "@/lib/schema";

export const SUBJECT: SchemaSubject & { brandVoice?: string | null } = {
  name: "Ada Lovelace",
  type: "person",
  description: "Ada Lovelace is a mathematician focused on analytical engines and early computing.",
  siteUrl: "https://ada.example",
  aliases: [],
  brandVoice: "clear, factual, no hype",
};

export const RETRIEVED = [
  {
    content: "Ada Lovelace wrote the first algorithm intended for Charles Babbage's analytical engine.",
    sourceType: "own_page" as const,
    url: "https://ada.example/about",
  },
  {
    content: "She is widely regarded as the first computer programmer for her notes on the analytical engine.",
    sourceType: "cited_page" as const,
    url: "https://en.wikipedia.org/wiki/Ada_Lovelace",
  },
];

export const WEAK_PROMPTS = ["Who is Ada Lovelace?", "What did Ada Lovelace contribute to computing?"];

/** A planted fact NOT present in any input — fabricating it would be a failure. */
export const FORBIDDEN_FACT = "won the Nobel Prize";

/** A saved model response: grounded in RETRIEVED, contains no fabricated facts. */
export const GENERATION_RESPONSE = JSON.stringify({
  title: "Ada Lovelace: Pioneer of the Analytical Engine",
  articleMd:
    "# Ada Lovelace\n\nAda Lovelace is a mathematician best known for writing the first algorithm intended for Charles Babbage's analytical engine.\n\n## Contributions\n\nHer notes on the analytical engine led many to regard her as the first computer programmer.\n",
  answers: [
    { question: "Who is Ada Lovelace?", answer: "A mathematician regarded as the first computer programmer." },
    {
      question: "What did Ada Lovelace contribute to computing?",
      answer: "She wrote the first algorithm intended for the analytical engine.",
    },
  ],
});

/** A response wrapped in markdown fences + prose — the parser must still recover it. */
export const GENERATION_RESPONSE_FENCED = "Sure! Here is the draft:\n```json\n" + GENERATION_RESPONSE + "\n```";
