"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Cadence, EngineId, Schedule } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getActiveSubject } from "@/lib/actions/subjects";
import { availableEnginesForUser, getUserSettings } from "@/lib/core/keys";
import { estimateAuditCost } from "@/lib/engines/pricing";
import {
  getDiffData,
  getSchedule,
  getTrackingData,
  scheduleTracking,
  type RunDiff,
  type TrackingData,
} from "@/lib/core/tracking";

export type TrackingState = {
  subjectId: string;
  enabledPromptCount: number;
  tracking: TrackingData;
  diff: RunDiff | null;
  schedule: Schedule | null;
  availableEngines: EngineId[];
  defaultEngines: EngineId[];
  defaultSamples: number;
  maxSpendPerRunUsd: number | null;
  maxSpendMonthlyUsd: number | null;
  hasResendEnv: boolean;
};

export async function getTrackingState(): Promise<TrackingState | null> {
  const data = await getActiveSubject();
  if (!data) return null;
  const subjectId = data.subject.id;
  const [tracking, diff, schedule, available, settings] = await Promise.all([
    getTrackingData(subjectId),
    getDiffData(subjectId),
    getSchedule(subjectId),
    availableEnginesForUser(data.subject.userId),
    getUserSettings(data.subject.userId),
  ]);
  return {
    subjectId,
    enabledPromptCount: data.prompts.filter((p) => p.enabled).length,
    tracking,
    diff,
    schedule,
    availableEngines: available,
    defaultEngines: settings.enabledEngines,
    defaultSamples: settings.samples,
    maxSpendPerRunUsd: settings.maxSpendPerRunUsd,
    maxSpendMonthlyUsd: settings.maxSpendMonthlyUsd,
    hasResendEnv: Boolean(process.env.RESEND_API_KEY?.trim()),
  };
}

/** Estimated per-run cost for a candidate schedule config (drives the confirm dialog). */
export async function estimateScheduleCost(engines: EngineId[], samples: number): Promise<number> {
  const data = await getActiveSubject();
  if (!data) return 0;
  const enabled = data.prompts.filter((p) => p.enabled).length;
  return estimateAuditCost(enabled, engines, samples);
}

const ScheduleSchema = z.object({
  cadence: z.enum(["weekly", "biweekly", "monthly"]),
  enabled: z.boolean(),
  engines: z.array(z.enum(["perplexity", "openai", "gemini", "claude"])).min(1).max(4),
  samples: z.number().int().min(1).max(10),
  email: z.boolean(),
});

/**
 * Create/update the subject's tracking schedule. Creating/enabling a standing
 * schedule is a persistent-config change → the UI confirms it first.
 */
export async function saveScheduleAction(input: {
  cadence: Cadence;
  enabled: boolean;
  engines: EngineId[];
  samples: number;
  email: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const data = await getActiveSubject();
  if (!data) return { ok: false, message: "Set up a subject first." };
  const parsed = ScheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid schedule settings." };

  await scheduleTracking(data.subject.id, parsed.data.cadence, {
    enabled: parsed.data.enabled,
    engines: parsed.data.engines,
    samples: parsed.data.samples,
    channels: { email: parsed.data.email },
  });
  revalidatePath("/app/tracking");
  return { ok: true };
}

/** Diff a specific pair of runs (the "what changed" run selector). */
export async function getDiffAction(runAId: string, runBId: string): Promise<RunDiff | null> {
  const user = await requireUser();
  const data = await getActiveSubject();
  if (!data || data.subject.userId !== user.id) return null;
  return getDiffData(data.subject.id, runAId, runBId);
}
