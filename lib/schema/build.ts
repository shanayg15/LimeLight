import type { Article, FAQPage, Organization, Person, Product } from "schema-dts";
import type { FaqItem, SubjectType } from "@/lib/db/schema";

/**
 * Build VALID JSON-LD with schema-dts types (compile-time) for a subject + an
 * optional article + FAQ. Returns a `@graph` so the entity, the article, and the
 * FAQ travel together. Only includes fields we actually have — never invents data.
 */

export type SchemaSubject = {
  name: string;
  type: SubjectType;
  description?: string | null;
  siteUrl?: string | null;
  aliases?: string[];
};

type GraphNode = Person | Organization | Product | Article | FAQPage;

function entityNode(subject: SchemaSubject): Person | Organization | Product {
  const sameAs = (subject.aliases ?? []).filter((a) => /^https?:\/\//i.test(a));
  const base = {
    name: subject.name,
    ...(subject.description ? { description: subject.description } : {}),
    ...(subject.siteUrl ? { url: subject.siteUrl } : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };
  if (subject.type === "business") return { "@type": "Organization", ...base };
  if (subject.type === "product") return { "@type": "Product", ...base };
  return { "@type": "Person", ...base };
}

function articleNode(title: string, subject: SchemaSubject): Article {
  return {
    "@type": "Article",
    headline: title,
    ...(subject.description ? { description: subject.description } : {}),
    author: { "@type": subject.type === "person" ? "Person" : "Organization", name: subject.name },
  };
}

function faqNode(faq: FaqItem[]): FAQPage | null {
  const valid = faq.filter((f) => f.question.trim() && f.answer.trim());
  if (valid.length === 0) return null;
  return {
    "@type": "FAQPage",
    mainEntity: valid.map((f) => ({
      "@type": "Question" as const,
      name: f.question.trim(),
      acceptedAnswer: { "@type": "Answer" as const, text: f.answer.trim() },
    })),
  };
}

/**
 * Build the JSON-LD `@graph` for a draft. `title` present → include an Article
 * node; non-empty `faq` → include a FAQPage. The entity node is always included.
 */
export function buildJsonLd(subject: SchemaSubject, opts: { title?: string; faq?: FaqItem[] } = {}): Record<string, unknown> {
  const nodes: GraphNode[] = [entityNode(subject)];
  if (opts.title?.trim()) nodes.push(articleNode(opts.title.trim(), subject));
  const faq = opts.faq ? faqNode(opts.faq) : null;
  if (faq) nodes.push(faq);

  if (nodes.length === 1) {
    // schema-dts nodes are objects here; spread is safe.
    return { "@context": "https://schema.org", ...(nodes[0] as unknown as Record<string, unknown>) };
  }
  return { "@context": "https://schema.org", "@graph": nodes };
}
