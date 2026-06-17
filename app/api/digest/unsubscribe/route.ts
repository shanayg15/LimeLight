import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { schedules } from "@/lib/db/schema";
import { verifyUnsubscribeToken } from "@/lib/core/digest";

/**
 * One-click digest unsubscribe from the email link. Auth-free but protected by a
 * signed token (HMAC of the schedule id) — sets channels.email=false. No login,
 * no other change. Honors disable immediately.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scheduleId = url.searchParams.get("s") ?? "";
  const token = url.searchParams.get("t") ?? "";

  const page = (msg: string, ok: boolean) =>
    new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#1a1a1a">
<h1 style="font-size:18px">${ok ? "Unsubscribed" : "Couldn't unsubscribe"}</h1>
<p>${msg}</p></body></html>`,
      { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8" } },
    );

  if (!scheduleId || !token || !verifyUnsubscribeToken(scheduleId, token)) {
    return page("This unsubscribe link is invalid.", false);
  }
  const [row] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
  if (!row) return page("This schedule no longer exists.", false);

  await db
    .update(schedules)
    .set({ channels: { ...row.channels, email: false }, updatedAt: new Date() })
    .where(eq(schedules.id, scheduleId));
  return page("You won't receive any more weekly digest emails for this subject. You can re-enable them anytime in Limelight settings.", true);
}
