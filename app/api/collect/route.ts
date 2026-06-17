import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subjects } from "@/lib/db/schema";
import { hostOf, ingestAnalyticsEvent } from "@/lib/core/analytics";

/**
 * Public collector for the opt-in tracking snippet on the user's OWN site.
 * Classifies AI human referrals vs AI bot traffic and stores only coarse,
 * non-PII signals (engine, path, referrer host, truncated UA). Rate-limited.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Coarse in-memory rate limit per subject (per server instance). Beacons are tiny;
// this just stops a single subject from flooding the table.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 600;
const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

// Only ever called AFTER the subject is verified, so bogus ?s= values can't allocate.
function allow(subjectId: string): boolean {
  const now = Date.now();
  // Opportunistic eviction so the map can't grow unboundedly.
  if (buckets.size > MAX_BUCKETS) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }
  const b = buckets.get(subjectId);
  if (!b || now > b.resetAt) {
    buckets.set(subjectId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (b.count >= MAX_PER_WINDOW) return false;
  b.count += 1;
  return true;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  const subjectId = new URL(req.url).searchParams.get("s") ?? "";
  if (!subjectId) return new NextResponse(null, { status: 204, headers: CORS });

  // Validate the subject FIRST (random UUID acts as the public token) so a bogus
  // ?s= can never allocate a rate-limit bucket.
  const [subject] = await db
    .select({ id: subjects.id, siteUrl: subjects.siteUrl })
    .from(subjects)
    .where(eq(subjects.id, subjectId))
    .limit(1);
  if (!subject) return new NextResponse(null, { status: 204, headers: CORS });
  if (!allow(subjectId)) return new NextResponse(null, { status: 429, headers: CORS });

  // If the subject declared a site, only accept beacons from that origin (best-effort
  // anti-forgery — the snippet runs on their own site). No site set → accept (best-effort).
  if (subject.siteUrl) {
    const origin = hostOf(req.headers.get("origin") ?? req.headers.get("referer"));
    const site = hostOf(subject.siteUrl);
    if (origin && site && origin !== site) return new NextResponse(null, { status: 204, headers: CORS });
  }

  let body: { p?: string; r?: string } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    /* tolerate malformed beacons */
  }

  try {
    await ingestAnalyticsEvent({
      subjectId,
      path: typeof body.p === "string" ? body.p : null,
      referrer: typeof body.r === "string" ? body.r : null,
      userAgent: req.headers.get("user-agent"),
    });
  } catch {
    /* never surface errors to a public beacon */
  }
  // Always 204 — the beacon doesn't read a body and we don't leak classification.
  return new NextResponse(null, { status: 204, headers: CORS });
}
