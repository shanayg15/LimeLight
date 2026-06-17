import { buildJsonLd, type SchemaSubject } from "./build";
import { validateJsonLd, type SchemaValidation } from "./validate";
import type { FaqItem } from "@/lib/db/schema";

export { buildJsonLd, type SchemaSubject } from "./build";
export { validateJsonLd, type SchemaValidation } from "./validate";

export type GeneratedSchema = { jsonLd: unknown; validation: SchemaValidation };

/**
 * Build + validate JSON-LD for a subject (+ optional article title and FAQ).
 * Always returns the built object AND its validation — callers must never treat
 * `jsonLd` as valid without checking `validation.valid`.
 */
export function generateSchema(
  subject: SchemaSubject,
  opts: { title?: string; faq?: FaqItem[] } = {},
): GeneratedSchema {
  const jsonLd = buildJsonLd(subject, opts);
  return { jsonLd, validation: validateJsonLd(jsonLd) };
}
