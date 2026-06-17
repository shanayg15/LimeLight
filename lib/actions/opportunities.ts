"use server";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditRuns, siteAudits } from "@/lib/db/schema";
import { findContentGaps, type Opportunity, type OpportunityKind } from "@/lib/core/actions";
import { getActiveSubject } from "@/lib/actions/subjects";

export type OpportunitiesState = {
  subjectId: string;
  siteUrl: string | null;
  hasRun: boolean;
  hasSiteAudit: boolean;
  opportunities: Opportunity[];
  counts: Record<OpportunityKind, number>;
};

/** Ranked Create/Improve/Earn/Engage actions for the active subject's latest data. */
export async function getOpportunitiesState(): Promise<OpportunitiesState | null> {
  const data = await getActiveSubject();
  if (!data) return null;
  const subjectId = data.subject.id;

  const [run] = await db
    .select({ id: auditRuns.id })
    .from(auditRuns)
    .where(eq(auditRuns.subjectId, subjectId))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);
  const [site] = await db
    .select({ id: siteAudits.id })
    .from(siteAudits)
    .where(eq(siteAudits.subjectId, subjectId))
    .orderBy(desc(siteAudits.crawledAt))
    .limit(1);

  const opportunities = run || site ? await findContentGaps(run?.id, site?.id) : [];
  const counts: Record<OpportunityKind, number> = { create: 0, improve: 0, earn: 0, engage: 0 };
  for (const o of opportunities) counts[o.kind] += 1;

  return {
    subjectId,
    siteUrl: data.subject.siteUrl,
    hasRun: Boolean(run),
    hasSiteAudit: Boolean(site),
    opportunities,
    counts,
  };
}
