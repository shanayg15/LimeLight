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
