"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  auditRuns,
  competitors,
  contentDrafts,
  prompts,
  schedules,
  siteAudits,
  subjects,
  users,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";

/**
 * Account hygiene (M8). Export bundles the user's own data as JSON (NEVER the
 * encrypted provider keys / secrets). Deletes are confirm-gated in the UI and
 * actually delete (FK cascades do the rest).
 */

export type DataExport = { exportedAt: string; user: { email: string | null }; subjects: unknown[] };

export async function exportMyData(): Promise<DataExport> {
  const user = await requireUser();
  const subjectRows = await db.select().from(subjects).where(eq(subjects.userId, user.id));
  const subjectIds = subjectRows.map((s) => s.id);

  const [comps, prm, runs, drafts, audits, scheds] = subjectIds.length
    ? await Promise.all([
        db.select().from(competitors).where(inArray(competitors.subjectId, subjectIds)),
        db.select().from(prompts).where(inArray(prompts.subjectId, subjectIds)),
        db.select().from(auditRuns).where(inArray(auditRuns.subjectId, subjectIds)).orderBy(desc(auditRuns.createdAt)),
        db.select().from(contentDrafts).where(inArray(contentDrafts.subjectId, subjectIds)),
        db.select().from(siteAudits).where(inArray(siteAudits.subjectId, subjectIds)),
        db.select().from(schedules).where(inArray(schedules.subjectId, subjectIds)),
      ])
    : [[], [], [], [], [], []];

  const bySubject = <T extends { subjectId: string }>(rows: T[], id: string) => rows.filter((r) => r.subjectId === id);

  return {
    exportedAt: new Date().toISOString(),
    user: { email: user.email ?? null },
    subjects: subjectRows.map((s) => ({
      ...s,
      competitors: bySubject(comps, s.id),
      prompts: bySubject(prm, s.id),
      // Runs carry their cached scores; raw model_responses are large + omitted from the export.
      auditRuns: bySubject(runs, s.id).map((r) => ({ id: r.id, status: r.status, config: r.config, scores: r.scores, costActualUsd: r.costActualUsd, createdAt: r.createdAt, finishedAt: r.finishedAt })),
      contentDrafts: bySubject(drafts, s.id),
      siteAudits: bySubject(audits, s.id),
      schedules: bySubject(scheds, s.id),
    })),
  };
}

/** Delete all of the user's subjects + their data (audits, drafts, schedules, …). Keeps the account. */
export async function deleteAllData(): Promise<{ deletedSubjects: number }> {
  const user = await requireUser();
  const rows = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.userId, user.id));
  // FK cascades remove competitors/prompts/runs/responses/mentions/citations/drafts/site_audits/schedules/embeddings.
  await db.delete(subjects).where(eq(subjects.userId, user.id));
  revalidatePath("/app");
  return { deletedSubjects: rows.length };
}

/** Permanently delete the account + everything it owns, then sign out. */
export async function deleteAccount(): Promise<void> {
  const user = await requireUser();
  // Deleting the user cascades subjects (and their data), provider_keys, and user_settings.
  await db.delete(users).where(eq(users.id, user.id));
  await signOut({ redirectTo: "/" });
}
