"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Cadence, EngineId, Schedule } from "@/lib/db/schema";
import { estimateScheduleCost, saveScheduleAction } from "@/lib/actions/tracking";

const ALL: EngineId[] = ["perplexity", "openai", "gemini", "claude"];
const CADENCES: Cadence[] = ["weekly", "biweekly", "monthly"];

export function ScheduleControl({
  schedule,
  availableEngines,
  defaultEngines,
  defaultSamples,
  hasResendEnv,
}: {
  schedule: Schedule | null;
  availableEngines: EngineId[];
  defaultEngines: EngineId[];
  defaultSamples: number;
  hasResendEnv: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cadence, setCadence] = useState<Cadence>(schedule?.cadence ?? "weekly");
  const [engines, setEngines] = useState<EngineId[]>(
    schedule?.engines?.length ? schedule.engines : defaultEngines.filter((e) => availableEngines.includes(e)),
  );
  const [samples, setSamples] = useState(schedule?.samples ?? defaultSamples);
  const [email, setEmail] = useState(schedule?.channels?.email ?? false);
  const [estimate, setEstimate] = useState<number | null>(null);

  const toggleEngine = (e: EngineId) =>
    setEngines((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));

  const loadEstimate = () => {
    void estimateScheduleCost(engines, samples).then(setEstimate);
  };

  const save = (enabled: boolean) =>
    start(async () => {
      const res = await saveScheduleAction({ cadence, enabled, engines, samples, email });
      if (res.ok) {
        toast.success(enabled ? `Tracking ${cadence} enabled.` : "Tracking disabled.");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });

  const enabled = schedule?.enabled ?? false;

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-primary" />
        <h2 className="text-base font-semibold">Scheduled tracking</h2>
        {enabled && <span className="rounded-md bg-positive/15 px-1.5 py-0.5 text-xs text-positive">On · {schedule?.cadence}</span>}
      </div>
      <p className="text-sm text-muted-foreground">
        Re-run your audit automatically and watch visibility move over time. Runs use your own model
        credits and honor your cost caps.
      </p>

      {schedule?.lastSkipReason && (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
          Last scheduled run was skipped: {schedule.lastSkipReason}.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Cadence</span>
          <select value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)} className="h-9 w-full rounded-md border border-input bg-background px-2 capitalize">
            {CADENCES.map((c) => (
              <option key={c} value={c} className="capitalize">{c}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Samples per prompt</span>
          <input type="number" min={1} max={10} value={samples} onChange={(e) => setSamples(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className="h-9 w-full rounded-md border border-input bg-background px-2" />
        </label>
      </div>

      <div className="space-y-1.5 text-sm">
        <span className="font-medium">Engines for scheduled runs</span>
        <div className="flex flex-wrap gap-2">
          {ALL.map((e) => {
            const usable = availableEngines.includes(e);
            const on = engines.includes(e);
            return (
              <button
                key={e}
                onClick={() => usable && toggleEngine(e)}
                disabled={!usable}
                title={usable ? "" : "Add an API key in Settings"}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs capitalize transition-colors",
                  on ? "border-primary/40 bg-primary/15 text-foreground" : "border-border text-muted-foreground",
                  !usable && "cursor-not-allowed opacity-50",
                )}
              >
                {e}{!usable && " (no key)"}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="size-4" />
        <Mail className="size-4 text-muted-foreground" />
        <span>Email me a weekly digest</span>
        {!hasResendEnv && <span className="text-xs text-muted-foreground">(needs a Resend key configured to actually send)</span>}
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        {/* Enabling/changing a standing schedule is persistent config → confirm. */}
        <Dialog>
          <DialogTrigger
            onClick={loadEstimate}
            className={cn(buttonVariants({ size: "sm" }), "gap-2")}
            disabled={pending || engines.length === 0}
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
            {enabled ? "Update schedule" : "Enable tracking"}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{enabled ? "Update tracking schedule?" : "Enable scheduled tracking?"}</DialogTitle>
              <DialogDescription>
                Limelight will run an audit <strong>{cadence}</strong> across {engines.join(", ")} ({samples} sample
                {samples === 1 ? "" : "s"} each) and may use your model credits.
                {email ? " A digest email will be sent each run (you can one-click unsubscribe)." : ""} Over-cap runs are
                skipped, never silently overspent.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border border-border px-3 py-2 text-sm">
              Estimated per run: <span className="font-medium">{estimate == null ? "…" : `~$${estimate.toFixed(2)}`}</span>
            </div>
            <DialogFooter>
              <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</DialogClose>
              <DialogClose className={cn(buttonVariants())} onClick={() => save(true)}>
                {enabled ? "Save schedule" : "Enable"}
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {enabled && (
          <Button variant="outline" size="sm" onClick={() => save(false)} disabled={pending}>
            Disable
          </Button>
        )}
      </div>
    </section>
  );
}
