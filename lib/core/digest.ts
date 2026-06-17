import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AuditScores, ScheduleChannels } from "@/lib/db/schema";
import type { RunDiff } from "@/lib/core/tracking";

/**
 * Weekly digest (M7). Sending email is a side-effect → only when the user opted
 * in (channels.email) AND a Resend key exists. The pure pieces (shouldSendDigest,
 * buildDigestSummary, renderDigestHtml, unsubscribe token) are eval-tested; never
 * fabricate a send — keyless / opted-out returns sent:false with a reason.
 */

export type DigestSummary = {
  subjectName: string;
  visibility: number | null;
  visibilityDelta: number | null;
  shareOfVoiceDelta: number | null;
  gained: string[];
  lost: string[];
  newOpportunities: string[];
  headline: string;
  /** False when the two compared runs used different engines/samples — deltas aren't real movement. */
  comparable: boolean;
};

/** The opt-in gate. Pure → the digest-gating eval asserts this directly. */
export function shouldSendDigest(channels: ScheduleChannels | null | undefined, hasResendKey: boolean): boolean {
  return Boolean(channels?.email) && hasResendKey;
}

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export function buildDigestSummary(input: {
  subjectName: string;
  latestScores: AuditScores | null;
  diff: RunDiff | null;
  opportunities: { title: string }[];
}): DigestSummary {
  const { subjectName, latestScores, diff } = input;
  const visibility = latestScores?.visibilityScore ?? null;
  const vDelta = diff?.visibilityDelta ?? null;
  // If the compared runs used different engines/samples, the deltas aren't real
  // movement — say so (same integrity rule the in-app diff banner enforces).
  const comparable = !diff?.configMismatch;

  let headline: string;
  if (!comparable) headline = `Your tracking config changed since last run — metrics aren't directly comparable. Visibility is now ${pct(visibility)}.`;
  else if (vDelta == null) headline = `Your first tracked snapshot for ${subjectName}.`;
  else if (vDelta > 0.001) headline = `Visibility up ${Math.round(vDelta * 100)} pts to ${pct(visibility)}.`;
  else if (vDelta < -0.001) headline = `Visibility down ${Math.round(Math.abs(vDelta) * 100)} pts to ${pct(visibility)}.`;
  else headline = `Visibility held steady at ${pct(visibility)}.`;

  return {
    subjectName,
    visibility,
    // Suppress deltas/gained/lost when not comparable — never present a config-driven swing as real.
    visibilityDelta: comparable ? vDelta : null,
    shareOfVoiceDelta: comparable ? (diff?.shareOfVoiceDelta ?? null) : null,
    gained: comparable ? (diff?.gainedMentions ?? []).map((m) => m.text) : [],
    lost: comparable ? (diff?.lostMentions ?? []).map((m) => m.text) : [],
    newOpportunities: input.opportunities.slice(0, 5).map((o) => o.title),
    headline,
    comparable,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDigestHtml(s: DigestSummary, unsubscribeUrl: string): string {
  const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "<p>None.</p>");
  const caveat = s.comparable
    ? ""
    : `<p style="font-size:13px;background:#fff4e0;border:1px solid #f0c987;padding:8px 10px;border-radius:6px">Heads up: your engines/samples changed since the previous run, so this run isn't directly comparable — movement figures are omitted.</p>`;
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
<h1 style="font-size:18px">Limelight — ${esc(s.subjectName)}</h1>
<p style="font-size:16px;font-weight:600">${esc(s.headline)}</p>
${caveat}
<p>Visibility: <strong>${pct(s.visibility)}</strong>${s.visibilityDelta != null ? ` (${s.visibilityDelta >= 0 ? "+" : ""}${Math.round(s.visibilityDelta * 100)} pts)` : ""}</p>
<h2 style="font-size:15px">Newly mentioned</h2>${list(s.gained)}
<h2 style="font-size:15px">Lost mentions</h2>${list(s.lost)}
<h2 style="font-size:15px">New opportunities</h2>${list(s.newOpportunities)}
<hr/>
<p style="font-size:12px;color:#777">You're getting this because you enabled weekly tracking emails in Limelight.
<a href="${unsubscribeUrl}">Turn these off</a>.</p>
</body></html>`;
}

// ── Signed unsubscribe token (one-click disable, no login required) ──────────

function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (s) return s;
  // Fail closed in production — never sign/verify unsubscribe tokens with a public dev secret.
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production (digest unsubscribe tokens).");
  }
  return "limelight-dev-secret";
}

export function unsubscribeToken(scheduleId: string): string {
  return createHmac("sha256", secret()).update(scheduleId).digest("hex");
}

export function verifyUnsubscribeToken(scheduleId: string, token: string): boolean {
  const expected = unsubscribeToken(scheduleId);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function hasResendKey(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

// ── runDigest (DB wrapper) ──────────────────────────────────────────────────

export type DigestResult = { sent: boolean; reason?: string; summary: DigestSummary };

/**
 * Build + (if opted-in & keyed) send the weekly digest for a schedule. Never
 * sends without opt-in; never throws to the caller (returns sent:false).
 */
export async function runDigest(scheduleId: string, baseUrl: string): Promise<DigestResult | null> {
  const { db } = await import("@/lib/db/client");
  const { schedules, subjects, users, auditRuns } = await import("@/lib/db/schema");
  const { getDiffData } = await import("@/lib/core/tracking");
  const { getOpportunitiesForSubject } = await import("@/lib/core/content-context");

  const [schedule] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
  if (!schedule) return null;
  const [subject] = await db.select().from(subjects).where(eq(subjects.id, schedule.subjectId)).limit(1);
  if (!subject) return null;

  const { desc } = await import("drizzle-orm");
  const [latest] = await db
    .select({ scores: auditRuns.scores })
    .from(auditRuns)
    .where(eq(auditRuns.subjectId, subject.id))
    .orderBy(desc(auditRuns.createdAt))
    .limit(1);
  const diff = await getDiffData(subject.id).catch(() => null);
  const opportunities = await getOpportunitiesForSubject(subject.id).catch(() => []);

  const summary = buildDigestSummary({
    subjectName: subject.name,
    latestScores: latest?.scores ?? null,
    diff,
    opportunities,
  });

  if (!shouldSendDigest(schedule.channels, hasResendKey())) {
    return { sent: false, reason: schedule.channels?.email ? "no Resend key configured" : "email not opted in", summary };
  }

  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, subject.userId)).limit(1);
  if (!user?.email) return { sent: false, reason: "no recipient email", summary };

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = process.env.DIGEST_FROM ?? "Limelight <onboarding@resend.dev>";
    const unsubscribeUrl = `${baseUrl}/api/digest/unsubscribe?s=${scheduleId}&t=${unsubscribeToken(scheduleId)}`;
    await resend.emails.send({
      from,
      to: user.email,
      subject: `Limelight digest — ${subject.name}: ${summary.headline}`,
      html: renderDigestHtml(summary, unsubscribeUrl),
    });
    return { sent: true, summary };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message.slice(0, 120) : "send failed", summary };
  }
}
