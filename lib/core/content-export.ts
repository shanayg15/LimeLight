import { eq } from "drizzle-orm";
import type { ContentDraft, FaqItem } from "@/lib/db/schema";
import { validateJsonLd } from "@/lib/schema";

/**
 * Export renderers (MD / HTML / JSON-LD). PURE → eval-tested. exportContent() is
 * the confirm-gated DB wrapper (the UI requires an explicit confirm dialog).
 * Export is the ONLY output path — nothing publishes or pushes to a CMS.
 */

export type ExportFormat = "md" | "html" | "jsonld";
export type ExportFile = { filename: string; mime: string; content: string };

export class SchemaInvalidError extends Error {
  constructor(public errors: string[]) {
    super(`Refusing to export invalid JSON-LD: ${errors.join("; ")}`);
    this.name = "SchemaInvalidError";
  }
}

/**
 * Serialize JSON for embedding inside a <script> element. Escapes `<`, `>`, `&`
 * to their \\uXXXX JSON escapes so a string value containing `</script>` or
 * `<!--` can't break out of the tag (stored-injection into the exported file).
 * The result is still valid JSON-LD (\\u003c parses back to `<`).
 */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "draft"
  );
}

// ── Markdown ────────────────────────────────────────────────────────────────

export function renderMarkdown(draft: Pick<ContentDraft, "title" | "bodyMd" | "faq">): string {
  const faq = draft.faq as FaqItem[];
  const parts = [draft.bodyMd.trim()];
  if (faq.length > 0) {
    parts.push("", "## FAQ", "", ...faq.flatMap((f) => [`### ${f.question}`, "", f.answer, ""]));
  }
  // Ensure an H1 exists (the article should already start with one).
  let md = parts.join("\n").trim();
  if (!/^#\s/m.test(md.split("\n")[0] ?? "")) md = `# ${draft.title}\n\n${md}`;
  return `${md}\n`;
}

// ── Minimal, safe Markdown → HTML (headings, lists, paragraphs, inline) ──────

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
}

function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) {
      html.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      html.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (li) {
      flushPara();
      list.push(li[1]);
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return html.join("\n");
}

export function renderHtml(
  draft: Pick<ContentDraft, "title" | "bodyMd" | "faq" | "jsonLd">,
): string {
  const faq = draft.faq as FaqItem[];
  const faqHtml = faq.length
    ? `<section><h2>FAQ</h2>${faq
        .map((f) => `<div><h3>${escapeHtml(f.question)}</h3><p>${escapeHtml(f.answer)}</p></div>`)
        .join("")}</section>`
    : "";
  // Embed JSON-LD only when it validates — never ship unvalidated schema. The
  // serialized JSON is script-escaped so a string value can't break out of the tag.
  const schemaOk = draft.jsonLd != null && validateJsonLd(draft.jsonLd).valid;
  const ldScript = schemaOk
    ? `<script type="application/ld+json">\n${jsonForScript(draft.jsonLd)}\n</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(draft.title)}</title>
${ldScript}
</head>
<body>
<article>
${mdToHtml(draft.bodyMd)}
${faqHtml}
</article>
</body>
</html>
`;
}

export function renderJsonLd(draft: Pick<ContentDraft, "jsonLd">): string {
  // The .jsonld file is pasted verbatim onto a site — refuse to emit invalid
  // (or empty) schema. "Invalid JSON-LD is worse than none."
  const v = validateJsonLd(draft.jsonLd);
  if (draft.jsonLd == null || !v.valid) throw new SchemaInvalidError(v.errors);
  return `${JSON.stringify(draft.jsonLd, null, 2)}\n`;
}

// ── Confirm-gated DB wrapper ──────────────────────────────────────────────

export function renderExport(draft: ContentDraft, format: ExportFormat): ExportFile {
  const slug = slugify(draft.title);
  if (format === "md") return { filename: `${slug}.md`, mime: "text/markdown", content: renderMarkdown(draft) };
  if (format === "jsonld") return { filename: `${slug}.jsonld`, mime: "application/ld+json", content: renderJsonLd(draft) };
  return { filename: `${slug}.html`, mime: "text/html", content: renderHtml(draft) };
}

/**
 * Produce an export file and mark the draft exported. Caller (action layer) does
 * the ownership check + the confirm gate. This NEVER publishes anywhere.
 */
export async function exportContent(draftId: string, format: ExportFormat): Promise<ExportFile> {
  const { db } = await import("@/lib/db/client");
  const { contentDrafts } = await import("@/lib/db/schema");
  const [draft] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).limit(1);
  if (!draft) throw new Error("Draft not found.");
  const file = renderExport(draft, format);
  await db.update(contentDrafts).set({ status: "exported", updatedAt: new Date() }).where(eq(contentDrafts.id, draftId));
  return file;
}
