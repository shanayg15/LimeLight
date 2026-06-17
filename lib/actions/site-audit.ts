"use server";

import { revalidatePath } from "next/cache";
import type { SiteAudit } from "@/lib/db/schema";
import { auditSite, getLatestSiteAudit } from "@/lib/core/site-audit";
import { UrlValidationError } from "@/lib/crawl/ssrf";
import { getActiveSubject } from "@/lib/actions/subjects";

/** Re-crawl is presented behind a "this fetches your site" confirm in the UI. */
const STALE_AFTER_MS = 1000 * 60 * 60 * 24; // a day

export type SiteAuditState = {
  subjectId: string;
  subjectName: string;
  siteUrl: string | null;
  audit: SiteAudit | null;
  /** True if the latest audit is older than STALE_AFTER_MS. */
  stale: boolean;
};

export async function getSiteAuditState(): Promise<SiteAuditState | null> {
  const data = await getActiveSubject();
  if (!data) return null;
  const audit = await getLatestSiteAudit(data.subject.id);
  return {
    subjectId: data.subject.id,
    subjectName: data.subject.name,
    siteUrl: data.subject.siteUrl,
    audit,
    stale: audit ? Date.now() - new Date(audit.crawledAt).getTime() > STALE_AFTER_MS : false,
  };
}

/**
 * Crawl the active subject's site and persist a fresh readiness audit. Crawling
 * is a network side-effect against the user's own site → the UI gates this
 * behind an explicit "this fetches your site" confirm. Returns the new audit.
 */
export async function runSiteAuditAction(): Promise<{ ok: true; audit: SiteAudit } | { ok: false; message: string }> {
  const data = await getActiveSubject();
  if (!data) return { ok: false, message: "Set up a subject first." };
  if (!data.subject.siteUrl) {
    return { ok: false, message: "Add a site URL for this subject in Settings, then re-run." };
  }
  try {
    const audit = await auditSite(data.subject.id);
    revalidatePath("/app/site-audit");
    revalidatePath("/app/actions");
    return { ok: true, audit };
  } catch (e) {
    if (e instanceof UrlValidationError) return { ok: false, message: e.message };
    const msg = e instanceof Error ? e.message : "Site audit failed.";
    return { ok: false, message: msg.slice(0, 200) };
  }
}
