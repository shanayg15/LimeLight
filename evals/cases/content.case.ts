import { describe, expect, it } from "vitest";
import {
  assembleDraft,
  buildScaffold,
  ContentParseError,
  parseGeneratedContent,
  type OpportunitySeed,
} from "@/lib/core/content";
import { renderHtml, renderMarkdown, renderExport, renderJsonLd, SchemaInvalidError } from "@/lib/core/content-export";
import { validateJsonLd } from "@/lib/schema";
import {
  SUBJECT,
  RETRIEVED,
  WEAK_PROMPTS,
  FORBIDDEN_FACT,
  GENERATION_RESPONSE,
  GENERATION_RESPONSE_FENCED,
} from "@/evals/fixtures/content-generation";

const OPP: OpportunitySeed = {
  id: "create-p1",
  kind: "create",
  title: "Publish content answering \"Who is Ada Lovelace?\"",
  targetTopic: "analytical engines",
  weakPrompts: WEAK_PROMPTS,
};

describe("parseGeneratedContent — defensive JSON parse", () => {
  it("parses a clean response", () => {
    const g = parseGeneratedContent(GENERATION_RESPONSE);
    expect(g.title).toMatch(/Ada Lovelace/);
    expect(g.answers).toHaveLength(2);
  });
  it("recovers a fenced / prose-wrapped response", () => {
    expect(parseGeneratedContent(GENERATION_RESPONSE_FENCED).answers).toHaveLength(2);
  });
  it("throws ContentParseError on malformed input (caller retries/degrades)", () => {
    expect(() => parseGeneratedContent("not json at all")).toThrow(ContentParseError);
    expect(() => parseGeneratedContent('{"title":"x"}')).toThrow(ContentParseError); // missing articleMd
  });
});

describe("assembleDraft — model path grounds + FAQ maps to weak prompts + valid schema", () => {
  const gen = parseGeneratedContent(GENERATION_RESPONSE);
  const draft = assembleDraft(SUBJECT, OPP, gen, RETRIEVED);

  it("FAQ questions are exactly the real weak prompts", () => {
    expect(draft.faq.map((f) => f.question)).toEqual(WEAK_PROMPTS);
    expect(draft.faq.every((f) => f.answer.trim().length > 0)).toBe(true);
  });
  it("article reflects retrieved facts", () => {
    expect(draft.bodyMd.toLowerCase()).toContain("analytical engine");
  });
  it("never contains a fabricated planted fact", () => {
    const blob = `${draft.bodyMd} ${draft.faq.map((f) => f.answer).join(" ")}`.toLowerCase();
    expect(blob).not.toContain(FORBIDDEN_FACT.toLowerCase());
  });
  it("emits VALID JSON-LD", () => {
    expect(draft.validationErrors).toEqual([]);
    expect(validateJsonLd(draft.jsonLd).valid).toBe(true);
    expect(draft.source).toBe("model");
  });
});

describe("buildScaffold / assembleDraft — keyless path invents nothing", () => {
  it("scaffold uses only the description + retrieved themes + weak prompts (no fabrication)", () => {
    const s = buildScaffold(SUBJECT, OPP, RETRIEVED);
    expect(s.articleMd.toLowerCase()).not.toContain(FORBIDDEN_FACT.toLowerCase());
    expect(s.articleMd).toContain(SUBJECT.description!);
    expect(s.faq.map((f) => f.question)).toEqual(WEAK_PROMPTS);
    expect(s.articleMd).toMatch(/scaffold/i); // clearly labeled
  });
  it("assembleDraft with no generation still yields valid schema + scaffold source", () => {
    const draft = assembleDraft(SUBJECT, OPP, null, RETRIEVED);
    expect(draft.source).toBe("scaffold");
    expect(validateJsonLd(draft.jsonLd).valid).toBe(true);
    expect(draft.faq.map((f) => f.question)).toEqual(WEAK_PROMPTS);
  });
});

describe("export integrity — MD/HTML/JSON-LD", () => {
  const gen = parseGeneratedContent(GENERATION_RESPONSE);
  const a = assembleDraft(SUBJECT, OPP, gen, RETRIEVED);
  const draft = { title: a.title, bodyMd: a.bodyMd, faq: a.faq, jsonLd: a.jsonLd } as Parameters<typeof renderHtml>[0];

  it("Markdown is well-formed with an H1 and an FAQ section", () => {
    const md = renderMarkdown(draft);
    expect(md.startsWith("# ")).toBe(true);
    expect(md).toContain("## FAQ");
    expect(md).toContain(WEAK_PROMPTS[0]);
  });

  it("HTML embeds the JSON-LD as a valid ld+json script", () => {
    const html = renderHtml(draft);
    expect(html).toContain('<script type="application/ld+json">');
    const m = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
    expect(m).toBeTruthy();
    expect(validateJsonLd(JSON.parse(m![1])).valid).toBe(true);
  });

  it("HTML does NOT embed invalid schema", () => {
    const bad = { ...draft, jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] } };
    expect(renderHtml(bad)).not.toContain('<script type="application/ld+json">');
  });

  it("renderExport picks the right filename + mime per format", () => {
    const full = { ...draft, status: "draft" } as Parameters<typeof renderExport>[0];
    expect(renderExport(full, "md").mime).toBe("text/markdown");
    expect(renderExport(full, "html").mime).toBe("text/html");
    expect(renderExport(full, "jsonld").mime).toBe("application/ld+json");
    expect(renderExport(full, "md").filename).toMatch(/\.md$/);
  });
});

describe("M6 review regressions", () => {
  it("renderJsonLd refuses to emit invalid/empty schema", () => {
    expect(() => renderJsonLd({ jsonLd: null })).toThrow(SchemaInvalidError);
    expect(() => renderJsonLd({ jsonLd: { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] } })).toThrow(
      SchemaInvalidError,
    );
    const valid = { "@context": "https://schema.org", "@type": "Person", name: "Ada" };
    expect(renderJsonLd({ jsonLd: valid })).toContain('"@type"');
  });

  it("HTML export script-escapes a </script> payload (no tag breakout) but stays valid JSON-LD", () => {
    const evil = "</script><img src=x onerror=alert(1)>";
    const a = assembleDraft(
      SUBJECT,
      { ...OPP, weakPrompts: ["Q?"] },
      { title: "T", articleMd: "# T\n\nbody", answers: [{ question: "Q?", answer: `Safe ${evil}` }] },
      [],
    );
    const html = renderHtml({ title: a.title, bodyMd: a.bodyMd, faq: a.faq, jsonLd: a.jsonLd });
    const m = html.match(/<script type="application\/ld\+json">\n([\s\S]*?)\n<\/script>/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain("</script>"); // payload neutralized in the embed
    expect(validateJsonLd(JSON.parse(m![1])).valid).toBe(true); // still valid + parseable
  });

  it("FAQ answer matches a near-verbatim question (missing trailing '?')", () => {
    const gen = { title: "T", articleMd: "# T", answers: [{ question: "Who is Ada Lovelace", answer: "A mathematician." }] };
    const d = assembleDraft(SUBJECT, { ...OPP, weakPrompts: ["Who is Ada Lovelace?"] }, gen, []);
    expect(d.faq[0].answer).toBe("A mathematician.");
  });
});
