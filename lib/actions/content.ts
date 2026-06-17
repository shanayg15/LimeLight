"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { contentDrafts, subjects, type ContentDraft, type FaqItem } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getActiveSubject } from "@/lib/actions/subjects";
import { generateContent } from "@/lib/core/content";
import { exportContent, type ExportFormat, type ExportFile } from "@/lib/core/content-export";
import { generateSchema, validateJsonLd, type SchemaSubject, type SchemaValidation } from "@/lib/schema";

async function loadOwnedDraft(draftId: string, userId: string): Promise<{ draft: ContentDraft; subjectUserId: string }> {
  const [draft] = await db.select().from(contentDrafts).where(eq(contentDrafts.id, draftId)).limit(1);
  if (!draft) throw new Error("Draft not found.");
  const [subject] = await db.select({ userId: subjects.userId }).from(subjects).where(eq(subjects.id, draft.subjectId)).limit(1);
  if (!subject || subject.userId !== userId) throw new Error("Draft not found.");
  return { draft, subjectUserId: subject.userId };
}

export type DraftSummary = {
  id: string;
  title: string;
  kind: ContentDraft["kind"];
  status: ContentDraft["status"];
  source: string;
  updatedAt: Date;
};

export async function listDrafts(): Promise<DraftSummary[]> {
  const data = await getActiveSubject();
  if (!data) return [];
  const rows = await db
    .select()
    .from(contentDrafts)
    .where(eq(contentDrafts.subjectId, data.subject.id))
    .orderBy(desc(contentDrafts.updatedAt));
  return rows.map((d) => ({ id: d.id, title: d.title, kind: d.kind, status: d.status, source: d.source, updatedAt: d.updatedAt }));
}

export type DraftView = { draft: ContentDraft; validation: SchemaValidation };

export async function getDraft(draftId: string): Promise<DraftView | null> {
  const user = await requireUser();
  const { draft } = await loadOwnedDraft(draftId, user.id);
  return { draft, validation: validateJsonLd(draft.jsonLd) };
}

/** Generate a draft from a Create/Improve opportunity (called by the Actions UI). */
export async function generateContentAction(opportunityId: string): Promise<{ draftId: string }> {
  const data = await getActiveSubject();
  if (!data) throw new Error("Set up a subject first.");
  const draftId = await generateContent(data.subject.id, opportunityId);
  revalidatePath("/app/content");
  return { draftId };
}

const SaveSchema = z.object({
  title: z.string().trim().min(1).max(200),
  bodyMd: z.string().max(60_000),
  faq: z.array(z.object({ question: z.string().trim().max(300), answer: z.string().trim().max(4000) })).max(30),
});

/**
 * Save edits. Schema is derived from the (edited) title + FAQ + subject so it
 * stays valid and in sync — we never persist hand-broken JSON-LD.
 */
export async function saveDraft(
  draftId: string,
  input: { title: string; bodyMd: string; faq: FaqItem[] },
): Promise<{ validation: SchemaValidation }> {
  const user = await requireUser();
  const { draft } = await loadOwnedDraft(draftId, user.id);
  const data = SaveSchema.parse(input);
  const cleanFaq = data.faq.filter((f) => f.question.trim() && f.answer.trim());

  const [subject] = await db.select().from(subjects).where(eq(subjects.id, draft.subjectId)).limit(1);
  const schemaSubject: SchemaSubject = {
    name: subject!.name,
    type: subject!.type as SchemaSubject["type"],
    description: subject!.description,
    siteUrl: subject!.siteUrl,
    aliases: subject!.aliases,
  };
  const { jsonLd, validation } = generateSchema(schemaSubject, { title: data.title, faq: cleanFaq });

  await db
    .update(contentDrafts)
    .set({ title: data.title, bodyMd: data.bodyMd, faq: cleanFaq, jsonLd, updatedAt: new Date() })
    .where(eq(contentDrafts.id, draftId));
  revalidatePath(`/app/content/${draftId}`);
  revalidatePath("/app/content");
  return { validation };
}

/** Rebuild JSON-LD from the current draft (the editor's "regenerate schema"). */
export async function regenerateSchemaAction(draftId: string): Promise<{ jsonLd: unknown; validation: SchemaValidation }> {
  const user = await requireUser();
  const { draft } = await loadOwnedDraft(draftId, user.id);
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, draft.subjectId)).limit(1);
  const { jsonLd, validation } = generateSchema(
    {
      name: subject!.name,
      type: subject!.type as SchemaSubject["type"],
      description: subject!.description,
      siteUrl: subject!.siteUrl,
      aliases: subject!.aliases,
    },
    { title: draft.title, faq: draft.faq },
  );
  await db.update(contentDrafts).set({ jsonLd, updatedAt: new Date() }).where(eq(contentDrafts.id, draftId));
  revalidatePath(`/app/content/${draftId}`);
  return { jsonLd, validation };
}

/** Regenerate the whole draft from its source opportunity (confirm-gated; overwrites). */
export async function regenerateDraftAction(draftId: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const { draft } = await loadOwnedDraft(draftId, user.id);
  if (!draft.opportunityId) return { ok: false, message: "This draft has no source opportunity to regenerate from." };
  try {
    // In-place atomic update — no temp row to orphan.
    await generateContent(draft.subjectId, draft.opportunityId, draftId);
    revalidatePath(`/app/content/${draftId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message.slice(0, 160) : "Regeneration failed." };
  }
}

/** Export to MD/HTML/JSON-LD (confirm-gated in the UI). Sets status='exported'. */
export async function exportDraftAction(draftId: string, format: ExportFormat): Promise<ExportFile> {
  const user = await requireUser();
  await loadOwnedDraft(draftId, user.id);
  z.enum(["md", "html", "jsonld"]).parse(format);
  const file = await exportContent(draftId, format);
  revalidatePath(`/app/content/${draftId}`);
  revalidatePath("/app/content");
  return file;
}

export async function deleteDraft(draftId: string): Promise<void> {
  const user = await requireUser();
  await loadOwnedDraft(draftId, user.id);
  await db.delete(contentDrafts).where(eq(contentDrafts.id, draftId));
  revalidatePath("/app/content");
}
