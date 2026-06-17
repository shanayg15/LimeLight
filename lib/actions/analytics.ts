"use server";

import { getActiveSubject } from "@/lib/actions/subjects";
import { buildSnippet, getAnalyticsForSubject, type AnalyticsSummary } from "@/lib/core/analytics";

export type AnalyticsState = {
  subjectId: string;
  subjectName: string;
  siteUrl: string | null;
  snippet: string;
  summary: AnalyticsSummary;
};

export async function getAnalyticsState(): Promise<AnalyticsState | null> {
  const data = await getActiveSubject();
  if (!data) return null;
  const baseUrl = process.env.APP_URL ?? "http://localhost:3012";
  const summary = await getAnalyticsForSubject(data.subject.id);
  return {
    subjectId: data.subject.id,
    subjectName: data.subject.name,
    siteUrl: data.subject.siteUrl,
    snippet: buildSnippet(data.subject.id, baseUrl),
    summary,
  };
}
