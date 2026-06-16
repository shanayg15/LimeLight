"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Play } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
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
import {
  getRunProgress,
  startAuditAction,
  type AuditState,
  type RunProgress,
} from "@/lib/actions/audits";

function isActive(status?: string) {
  return status === "queued" || status === "running";
}

export function AuditRunControl({ state }: { state: AuditState }) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(
    state.run && isActive(state.run.status) ? state.run.id : null,
  );
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startRun] = useTransition();

  useEffect(() => {
    if (!runId) return;
    let active = true;
    const tick = async () => {
      try {
        const p = await getRunProgress(runId);
        if (!active) return;
        setProgress(p);
        if (p.status === "complete" || p.status === "failed") {
          setRunId(null);
          router.refresh();
          return;
        }
      } catch {
        // transient; keep polling
      }
      if (active) setTimeout(tick, 1500);
    };
    void tick();
    return () => {
      active = false;
    };
  }, [runId, router]);

  const onRun = () => {
    setError(null);
    startRun(async () => {
      try {
        const { auditRunId } = await startAuditAction();
        setRunId(auditRunId);
        setProgress({
          status: "queued",
          promptsDone: 0,
          promptsTotal: state.enabledCount,
          scores: null,
          error: null,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't start the audit.");
      }
    });
  };

  // Running / queued
  if (runId || isActive(progress?.status)) {
    const done = progress?.promptsDone ?? 0;
    const total = progress?.promptsTotal || state.enabledCount;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>
            Auditing… {done}/{total} prompts
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Runs as a background job — safe to leave this page.
        </p>
      </div>
    );
  }

  const failed = state.run?.status === "failed";

  if (state.missingKey) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
          <AlertTriangle className="size-4 text-primary" />
          <span>
            Add an API key for an enabled engine in{" "}
            <Link href="/app/settings" className="text-primary underline">
              Settings
            </Link>{" "}
            to run an audit. Limelight never fabricates results — a real, search-enabled engine is
            required.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Dialog>
        <DialogTrigger
          className={cn(buttonVariants({ size: "sm" }), "gap-2")}
          disabled={!state.canRun || pending}
        >
          <Play className="size-4" />
          {state.run ? "Run again" : "Run audit"}
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run an audit</DialogTitle>
            <DialogDescription>
              Fan your {state.enabledCount} enabled prompt{state.enabledCount === 1 ? "" : "s"} across{" "}
              {state.engines.join(", ")} · {state.samples} sample
              {state.samples === 1 ? "" : "s"} each. This spends your own API credits.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border px-3 py-2 text-sm">
            Estimated cost:{" "}
            <span className="font-medium text-foreground">~${state.estimateUsd.toFixed(2)}</span>
            <span className="text-muted-foreground">
              {" "}
              ({state.enabledCount} × {state.engines.length} × {state.samples} calls)
            </span>
          </div>
          <DialogFooter>
            <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </DialogClose>
            <DialogClose className={cn(buttonVariants())} onClick={onRun}>
              Run audit
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {failed && (
        <p className="text-sm text-destructive">
          Last run failed{state.run?.error ? `: ${state.run.error}` : ""}. Try again.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {pending && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Starting…
        </p>
      )}
    </div>
  );
}
