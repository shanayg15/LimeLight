import { describe, expect, it } from "vitest";
import {
  generatePromptSet,
  parseGeneratedPrompts,
  PROMPT_INTENTS,
  PromptParseError,
  templatePromptSet,
  type SubjectSeed,
} from "@/lib/core/prompts";
import {
  CLEAN_JSON,
  COMPETITOR_JSON,
  FENCED_JSON,
  MALFORMED,
  MIXED_VALIDITY,
  PROVIDED_COMPETITORS,
  TRAILING_PROSE,
} from "../fixtures/prompt-responses";

const ALLOWED = new Set<string>(PROMPT_INTENTS);

const PERSON: SubjectSeed = {
  name: "Ada Lovelace",
  type: "person",
  description: "Mathematician known for work on the Analytical Engine.",
  topics: ["analytical engines", "computing history"],
  competitors: ["Charles Babbage"],
};
const BUSINESS: SubjectSeed = {
  name: "Acme Studio",
  type: "business",
  topics: ["brand design", "logo design"],
};
const PRODUCT: SubjectSeed = {
  name: "Mailwise",
  type: "product",
  topics: ["email", "newsletters"],
  competitors: ["Mailchimp", "Substack"],
};
// Edge case: a single-topic subject must still reach the 15-prompt minimum.
const ONE_TOPIC: SubjectSeed = { name: "Solo Dev", type: "person", topics: ["indie hacking"] };

describe("parseGeneratedPrompts — structure & contract", () => {
  it("parses a clean JSON array into {text,topic,intent} with allowed intents", () => {
    const prompts = parseGeneratedPrompts(CLEAN_JSON);
    expect(prompts.length).toBeGreaterThanOrEqual(15);
    for (const p of prompts) {
      expect(typeof p.text).toBe("string");
      expect(p.text.length).toBeGreaterThanOrEqual(3);
      expect(typeof p.topic).toBe("string");
      expect(ALLOWED.has(p.intent)).toBe(true);
    }
  });
});

describe("parseGeneratedPrompts — robustness", () => {
  it("recovers from a markdown-fenced array", () => {
    expect(parseGeneratedPrompts(FENCED_JSON).length).toBeGreaterThanOrEqual(15);
  });

  it("recovers from chatty prose around the array", () => {
    expect(parseGeneratedPrompts(TRAILING_PROSE).length).toBeGreaterThanOrEqual(15);
  });

  it("throws PromptParseError (never crashes) on output with no array", () => {
    expect(() => parseGeneratedPrompts(MALFORMED)).toThrow(PromptParseError);
  });

  it("drops invalid items but keeps valid ones", () => {
    const prompts = parseGeneratedPrompts(MIXED_VALIDITY);
    expect(prompts).toHaveLength(2);
    expect(prompts.every((p) => ALLOWED.has(p.intent) && p.text.length >= 3)).toBe(true);
  });
});

describe("templatePromptSet — coverage & no hallucinated competitors", () => {
  it("covers the subject name and every topic", () => {
    const prompts = templatePromptSet(PRODUCT);
    expect(prompts.some((p) => p.text.includes("Mailwise"))).toBe(true);
    for (const topic of PRODUCT.topics) {
      expect(prompts.some((p) => p.topic === topic || p.text.toLowerCase().includes(topic))).toBe(true);
    }
  });

  it("only references provided competitors (or generic 'Alternatives to X')", () => {
    const seed: SubjectSeed = {
      name: "Mailwise",
      type: "product",
      topics: ["notes"],
      competitors: PROVIDED_COMPETITORS,
    };
    const comparison = templatePromptSet(seed).filter((p) => p.intent === "comparison");
    for (const p of comparison) {
      const ok =
        PROVIDED_COMPETITORS.some((c) => p.text.includes(c)) ||
        p.text.startsWith("Alternatives to ");
      expect(ok).toBe(true);
    }
  });

  it("invents no competitor when none are provided", () => {
    const prompts = templatePromptSet(BUSINESS);
    const comparison = prompts.filter((p) => p.intent === "comparison");
    expect(comparison.every((p) => p.text.startsWith("Alternatives to "))).toBe(true);
  });
});

describe("generatePromptSet — keyless template path (no API key)", () => {
  // No ANTHROPIC_API_KEY in the test env -> deterministic template fallback.
  for (const seed of [PERSON, BUSINESS, PRODUCT, ONE_TOPIC]) {
    it(`returns 15–30 covered, deduped prompts for a ${seed.type}`, async () => {
      const { prompts, source } = await generatePromptSet(seed);
      expect(source).toBe("template");
      expect(prompts.length).toBeGreaterThanOrEqual(15);
      expect(prompts.length).toBeLessThanOrEqual(30);

      // Intents valid
      expect(prompts.every((p) => ALLOWED.has(p.intent))).toBe(true);

      // No duplicates (normalized)
      const norm = prompts.map((p) => p.text.toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/g, "").trim());
      expect(new Set(norm).size).toBe(norm.length);

      // Name + each topic covered
      expect(prompts.some((p) => p.text.includes(seed.name))).toBe(true);
      for (const topic of seed.topics) {
        expect(prompts.some((p) => p.topic === topic || p.text.toLowerCase().includes(topic))).toBe(true);
      }
    });
  }
});

describe("hallucinated-competitor guard via the parser", () => {
  it("a well-behaved response references only provided competitors", () => {
    const prompts = parseGeneratedPrompts(COMPETITOR_JSON);
    const comparison = prompts.filter((p) => p.intent === "comparison");
    expect(comparison.length).toBeGreaterThan(0);
    for (const p of comparison) {
      const ok =
        PROVIDED_COMPETITORS.some((c) => p.text.includes(c)) ||
        p.text.startsWith("Alternatives to ");
      expect(ok).toBe(true);
    }
  });
});
