"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  competitors,
  prompts,
  subjects,
  type Competitor,
  type Prompt,
  type Subject,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { generatePromptSet, PROMPT_INTENTS } from "@/lib/core/prompts";

// ── Validation ─────────────────────────────────────────────────────────

function httpUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const v = value.trim();
  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Not exported: a "use server" module may only export async functions.
const SubjectInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  type: z.enum(["person", "business", "product"]),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  siteUrl: z.string().trim().max(300).optional(),
  description: z.string().trim().max(500).optional(),
  brandVoice: z.string().trim().max(500).optional(),
  topics: z
    .array(z.string().trim().min(1).max(120))
    .min(1, "Add at least one topic.")
    .max(12),
});
export type SubjectInput = z.input<typeof SubjectInputSchema>;

const CompetitorNameSchema = z.string().trim().min(1).max(160);
const CompetitorListSchema = z.array(CompetitorNameSchema).max(20);

// ── Helpers ────────────────────────────────────────────────────────────

async function assertSubjectOwned(subjectId: string, userId: string): Promise<Subject> {
  const [row] = await db.select().from(subjects).where(eq(subjects.id, subjectId)).limit(1);
  if (!row || row.userId !== userId) throw new Error("Subject not found.");
  return row;
}

export type SubjectWithRelations = {
  subject: Subject;
  competitors: Competitor[];
  prompts: Prompt[];
};

// ── Subject CRUD ─────────────────────────────────────────────────────────

export async function listSubjects(): Promise<Subject[]> {
  const user = await requireUser();
  return db
    .select()
    .from(subjects)
    .where(eq(subjects.userId, user.id))
    .orderBy(desc(subjects.updatedAt));
}

export async function getActiveSubject(): Promise<SubjectWithRelations | null> {
  const user = await requireUser();
  const userSubjects = await db
    .select()
    .from(subjects)
    .where(eq(subjects.userId, user.id))
    .orderBy(desc(subjects.isActive), desc(subjects.updatedAt));
  const subject = userSubjects[0];
  if (!subject) return null;

  const [comps, prmpts] = await Promise.all([
    db.select().from(competitors).where(eq(competitors.subjectId, subject.id)),
    db
      .select()
      .from(prompts)
      .where(eq(prompts.subjectId, subject.id))
      .orderBy(desc(prompts.createdAt)),
  ]);
  return { subject, competitors: comps, prompts: prmpts };
}

export async function createSubject(input: SubjectInput): Promise<{ id: string }> {
  const user = await requireUser();
  const data = SubjectInputSchema.parse(input);

  // First subject for this user becomes active.
  const existing = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.userId, user.id));
  const isFirst = existing.length === 0;

  const [row] = await db
    .insert(subjects)
    .values({
      userId: user.id,
      name: data.name,
      type: data.type,
      aliases: data.aliases,
      siteUrl: httpUrlOrNull(data.siteUrl),
      description: data.description?.trim() || null,
      brandVoice: data.brandVoice?.trim() || null,
      topics: data.topics,
      isActive: isFirst,
    })
    .returning({ id: subjects.id });

  revalidatePath("/app");
  return { id: row.id };
}

export async function updateSubject(id: string, input: SubjectInput): Promise<void> {
  const user = await requireUser();
  await assertSubjectOwned(id, user.id);
  const data = SubjectInputSchema.parse(input);

  await db
    .update(subjects)
    .set({
      name: data.name,
      type: data.type,
      aliases: data.aliases,
      siteUrl: httpUrlOrNull(data.siteUrl),
      description: data.description?.trim() || null,
      brandVoice: data.brandVoice?.trim() || null,
      topics: data.topics,
      updatedAt: new Date(),
    })
    .where(eq(subjects.id, id));

  revalidatePath("/app/settings");
  revalidatePath("/app");
}

export async function setActiveSubject(id: string): Promise<void> {
  const user = await requireUser();
  await assertSubjectOwned(id, user.id);
  await db.transaction(async (tx) => {
    await tx
      .update(subjects)
      .set({ isActive: false })
      .where(eq(subjects.userId, user.id));
    await tx.update(subjects).set({ isActive: true }).where(eq(subjects.id, id));
  });
  revalidatePath("/app");
}

// ── Competitors ────────────────────────────────────────────────────────

export async function addCompetitor(
  subjectId: string,
  name: string,
  aliases: string[] = [],
): Promise<{ id: string }> {
  const user = await requireUser();
  await assertSubjectOwned(subjectId, user.id);
  const clean = CompetitorNameSchema.parse(name);
  const cleanAliases = CompetitorListSchema.parse(aliases.map((a) => a.trim()).filter(Boolean));
  const [row] = await db
    .insert(competitors)
    .values({ subjectId, name: clean, aliases: cleanAliases })
    .returning({ id: competitors.id });
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { id: row.id };
}

export async function removeCompetitor(competitorId: string): Promise<void> {
  const user = await requireUser();
  const [row] = await db.select().from(competitors).where(eq(competitors.id, competitorId)).limit(1);
  if (!row) return;
  await assertSubjectOwned(row.subjectId, user.id);
  await db.delete(competitors).where(eq(competitors.id, competitorId));
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

// ── Prompt generation + curation ─────────────────────────────────────────

export async function generatePrompts(
  subjectId: string,
): Promise<{ source: "model" | "template"; count: number }> {
  const user = await requireUser();
  const subject = await assertSubjectOwned(subjectId, user.id);
  const comps = await db.select().from(competitors).where(eq(competitors.subjectId, subjectId));

  const result = await generatePromptSet({
    name: subject.name,
    type: subject.type as "person" | "business" | "product",
    description: subject.description,
    siteUrl: subject.siteUrl,
    aliases: subject.aliases,
    topics: subject.topics,
    competitors: comps.map((c) => c.name),
  });

  // Replace prior generated prompts the user hasn't edited; keep manual + edited.
  await db
    .delete(prompts)
    .where(
      and(
        eq(prompts.subjectId, subjectId),
        eq(prompts.source, "generated"),
        eq(prompts.edited, false),
      ),
    );

  if (result.prompts.length > 0) {
    await db.insert(prompts).values(
      result.prompts.map((p) => ({
        subjectId,
        text: p.text,
        source: "generated" as const,
        topic: p.topic || null,
        intent: p.intent,
        enabled: true,
        edited: false,
      })),
    );
  }

  revalidatePath("/app/settings");
  revalidatePath("/onboarding");
  revalidatePath("/app");
  return { source: result.source, count: result.prompts.length };
}

/**
 * Onboarding: create-or-update the subject, sync competitors, generate prompts,
 * and return the persisted prompt set. Idempotent across back/forward in the stepper
 * (pass the returned subjectId to avoid creating duplicates).
 */
export async function saveOnboarding(params: {
  subjectId: string | null;
  input: SubjectInput;
  competitorNames: string[];
}): Promise<{ subjectId: string; source: "model" | "template"; prompts: Prompt[] }> {
  const user = await requireUser();

  let subjectId = params.subjectId;
  if (subjectId) {
    await updateSubject(subjectId, params.input);
  } else {
    const created = await createSubject(params.input);
    subjectId = created.id;
  }

  // Explicit local ownership guard (don't rely only on updateSubject's throw).
  await assertSubjectOwned(subjectId, user.id);

  // Replace competitors wholesale (simple + correct for the onboarding flow).
  await db.delete(competitors).where(eq(competitors.subjectId, subjectId));
  const names = CompetitorListSchema.parse([
    ...new Set(params.competitorNames.map((n) => n.trim()).filter(Boolean)),
  ]);
  if (names.length > 0) {
    await db.insert(competitors).values(names.map((name) => ({ subjectId, name, aliases: [] })));
  }

  const gen = await generatePrompts(subjectId);
  const persisted = await db
    .select()
    .from(prompts)
    .where(eq(prompts.subjectId, subjectId))
    .orderBy(desc(prompts.createdAt));

  return { subjectId, source: gen.source, prompts: persisted };
}

/** Settings: update the subject identity + replace its competitor set (no regenerate). */
export async function saveSubjectSettings(
  subjectId: string,
  input: SubjectInput,
  competitorNames: string[],
): Promise<void> {
  const user = await requireUser();
  await assertSubjectOwned(subjectId, user.id);
  await updateSubject(subjectId, input);
  await db.delete(competitors).where(eq(competitors.subjectId, subjectId));
  const names = CompetitorListSchema.parse([
    ...new Set(competitorNames.map((n) => n.trim()).filter(Boolean)),
  ]);
  if (names.length > 0) {
    await db.insert(competitors).values(names.map((name) => ({ subjectId, name, aliases: [] })));
  }
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

const PromptEditSchema = z.object({
  text: z.string().trim().min(3).max(300),
  topic: z.string().trim().max(120).optional(),
  intent: z.enum(PROMPT_INTENTS).optional(),
  enabled: z.boolean().optional(),
});

export async function upsertPrompt(
  subjectId: string,
  input: z.input<typeof PromptEditSchema>,
  promptId?: string,
): Promise<{ id: string }> {
  const user = await requireUser();
  await assertSubjectOwned(subjectId, user.id);
  const data = PromptEditSchema.parse(input);

  if (promptId) {
    const [existing] = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
    if (!existing || existing.subjectId !== subjectId) throw new Error("Prompt not found.");
    await db
      .update(prompts)
      .set({
        text: data.text,
        topic: data.topic?.trim() || null,
        intent: data.intent ?? existing.intent,
        enabled: data.enabled ?? existing.enabled,
        // Editing a generated prompt marks it edited so regenerate won't clobber it.
        edited: existing.source === "generated" ? true : existing.edited,
      })
      .where(eq(prompts.id, promptId));
    revalidatePath("/app/settings");
    revalidatePath("/app");
    return { id: promptId };
  }

  const [row] = await db
    .insert(prompts)
    .values({
      subjectId,
      text: data.text,
      source: "manual",
      topic: data.topic?.trim() || null,
      intent: data.intent ?? "discovery",
      enabled: data.enabled ?? true,
      edited: false,
    })
    .returning({ id: prompts.id });
  revalidatePath("/app/settings");
  revalidatePath("/app");
  return { id: row.id };
}

export async function togglePrompt(promptId: string, enabled: boolean): Promise<void> {
  const user = await requireUser();
  const [row] = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
  if (!row) return;
  await assertSubjectOwned(row.subjectId, user.id);
  // Toggling a generated prompt marks it edited so regenerate preserves the choice.
  await db
    .update(prompts)
    .set({ enabled, edited: row.source === "generated" ? true : row.edited })
    .where(eq(prompts.id, promptId));
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

export async function deletePrompt(promptId: string): Promise<void> {
  const user = await requireUser();
  const [row] = await db.select().from(prompts).where(eq(prompts.id, promptId)).limit(1);
  if (!row) return;
  await assertSubjectOwned(row.subjectId, user.id);
  await db.delete(prompts).where(eq(prompts.id, promptId));
  revalidatePath("/app/settings");
  revalidatePath("/app");
}
