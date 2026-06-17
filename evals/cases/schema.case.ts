import { describe, expect, it } from "vitest";
import { generateSchema, validateJsonLd } from "@/lib/schema";

const FAQ = [
  { question: "Who is Ada Lovelace?", answer: "A mathematician." },
  { question: "What is the analytical engine?", answer: "An early mechanical computer." },
];

describe("generateSchema — valid JSON-LD per subject type + FAQPage", () => {
  for (const type of ["person", "business", "product"] as const) {
    it(`builds valid schema for a ${type} subject with an FAQ`, () => {
      const { jsonLd, validation } = generateSchema(
        { name: "Ada Lovelace", type, description: "desc", siteUrl: "https://ada.example", aliases: [] },
        { title: "Ada Lovelace: Profile", faq: FAQ },
      );
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      const graph = (jsonLd as { "@graph": { "@type": string }[] })["@graph"];
      expect(graph.some((n) => /FAQPage/.test(n["@type"]))).toBe(true);
      const entityType = type === "business" ? "Organization" : type === "product" ? "Product" : "Person";
      expect(graph.some((n) => n["@type"] === entityType)).toBe(true);
    });
  }

  it("flags a subject with no name as invalid (required field missing)", () => {
    const { validation } = generateSchema({ name: "", type: "person", aliases: [] }, { title: "x" });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/name/i);
  });
});

describe("validateJsonLd — catches malformed schema before export", () => {
  it("rejects an FAQPage with no questions", () => {
    const r = validateJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/mainEntity|Question/i);
  });

  it("rejects a Question missing its acceptedAnswer", () => {
    const r = validateJsonLd({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q?" }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toMatch(/acceptedAnswer/i);
  });

  it("accepts a well-formed single Person node", () => {
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "Person", name: "Ada" }).valid).toBe(true);
  });

  it("rejects empty / non-object schema", () => {
    expect(validateJsonLd(null).valid).toBe(false);
    expect(validateJsonLd({ "@graph": [] }).valid).toBe(false);
  });
});
