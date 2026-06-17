import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditRuns } from "@/lib/db/schema";
import { inngest } from "./client";
import {
  AUDIT_EVENT,
  auditOnePrompt,
  finalizeRun,
  loadAuditContext,
  sumActualCost,
} from "@/lib/core/audit";
import type { ScoreResponseInput } from "@/lib/core/score";
import { fireDueSchedule, findDueSchedules } from "@/lib/core/tracking";
import { runDigest } from "@/lib/core/digest";

export const DIGEST_EVENT = "digest/run.requested";

/**
 * Durable audit job. Each prompt is its own step, so partial progress survives a
 * restart (completed prompts aren't re-queried). Engine failures are recorded as
 * failed responses inside auditOnePrompt and never abort the run.
 */
export const auditRunFn = inngest.createFunction(
  { id: "audit-run", retries: 1, triggers: { event: AUDIT_EVENT } },
  async ({ event, step }) => {
    const auditRunId = (event.data as { auditRunId: string }).auditRunId;

    try {
      const ctx = await loadAuditContext(auditRunId);

      await step.run("start", async () => {
        await db
          .update(auditRuns)
          .set({ status: "running", startedAt: new Date(), promptsTotal: ctx.prompts.length })
          .where(eq(auditRuns.id, auditRunId));
        return ctx.prompts.length;
      });

      if (ctx.engines.length === 0) {
        await step.run("fail-no-engine", async () => {
          await db
            .update(auditRuns)
            .set({
              status: "failed",
              error: "No usable answer-engine key configured (set PERPLEXITY_API_KEY).",
              finishedAt: new Date(),
            })
            .where(eq(auditRuns.id, auditRunId));
        });
        return { ok: false, reason: "no-engine" };
      }

      const responses: ScoreResponseInput[] = [];
      let done = 0;
      for (const prompt of ctx.prompts) {
        const inputs = await step.run(`prompt-${prompt.id}`, () => auditOnePrompt(ctx, prompt));
        responses.push(...inputs);
        done += 1;
        await step.run(`progress-${prompt.id}`, async () => {
          await db.update(auditRuns).set({ promptsDone: done }).where(eq(auditRuns.id, auditRunId));
        });

        // Mid-run cost-cap enforcement: stop gracefully (partial run) if over.
        const cap = ctx.run.config.maxSpendUsd;
        if (cap != null) {
          const spent = await step.run(`cost-${prompt.id}`, () => sumActualCost(auditRunId));
          if (spent > cap) break;
        }
      }

      await step.run("score", () => finalizeRun(ctx, responses));

      // Scheduled run → enqueue the digest (runDigest itself gates on opt-in).
      if (ctx.run.scheduleId) {
        const scheduleId = ctx.run.scheduleId;
        await step.run("enqueue-digest", () => inngest.send({ name: DIGEST_EVENT, data: { scheduleId } }));
      }
      return { ok: true, prompts: ctx.prompts.length, responses: responses.length };
    } catch (err) {
      await step.run("fail", async () => {
        await db
          .update(auditRuns)
          .set({
            status: "failed",
            error: (err instanceof Error ? err.message : String(err)).slice(0, 500),
            finishedAt: new Date(),
          })
          .where(eq(auditRuns.id, auditRunId));
      });
      return { ok: false, reason: "error" };
    }
  },
);

/**
 * Hourly tracking cron. Finds due+enabled schedules and fires each (cost-capped;
 * over-cap → skip + record). Advancing nextRunAt per-schedule inside fireDueSchedule
 * keeps it from double-firing across ticks. Each schedule is its own durable step.
 */
export const trackingCronFn = inngest.createFunction(
  // concurrency:1 prevents an overlapping tick; fireDueSchedule also claims atomically.
  { id: "tracking-cron", concurrency: { limit: 1 }, triggers: { cron: "0 * * * *" } },
  async ({ step }) => {
    const now = new Date();
    const due = await step.run("find-due", async () => (await findDueSchedules(now)).map((s) => s.id));
    let fired = 0;
    for (const scheduleId of due) {
      const result = await step.run(`fire-${scheduleId}`, async () => {
        const { db } = await import("@/lib/db/client");
        const { schedules } = await import("@/lib/db/schema");
        const { eq } = await import("drizzle-orm");
        const [s] = await db.select().from(schedules).where(eq(schedules.id, scheduleId)).limit(1);
        // Re-check due at execution time (idempotent if another tick already advanced it).
        if (!s || !s.enabled || !s.nextRunAt || s.nextRunAt.getTime() > now.getTime()) return { fired: false, reason: "not due" };
        return fireDueSchedule(s, now);
      });
      if (result.fired) fired += 1;
    }
    return { due: due.length, fired };
  },
);

/** Build + (opt-in-gated) send a weekly digest for a schedule. */
export const digestFn = inngest.createFunction(
  { id: "digest-run", retries: 1, triggers: { event: DIGEST_EVENT } },
  async ({ event, step }) => {
    const scheduleId = (event.data as { scheduleId: string }).scheduleId;
    const baseUrl = process.env.APP_URL ?? "http://localhost:3012";
    return step.run("digest", async () => {
      const res = await runDigest(scheduleId, baseUrl);
      return { sent: res?.sent ?? false, reason: res?.reason };
    });
  },
);
