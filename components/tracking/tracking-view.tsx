"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RunDiff } from "@/lib/core/tracking";
import type { TrackingState } from "@/lib/actions/tracking";
import { getDiffAction } from "@/lib/actions/tracking";
import { TrendCharts } from "./trend-charts";
import { ScheduleControl } from "./schedule-control";

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}
function deltaPts(n: number | null) {
  if (n == null) return null;
  const v = Math.round(n * 100);
  return v;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  const v = deltaPts(delta);
  if (v == null) return <span className="text-muted-foreground">—</span>;
  if (v === 0) return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="size-3" />0</span>;
  const up = v > 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5", up ? "text-positive" : "text-negative")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(v)} pts
    </span>
  );
}

export function TrackingView({ state }: { state: TrackingState }) {
  const { tracking } = state;
  const [diff, setDiff] = useState<RunDiff | null>(state.diff);
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const [, startCompare] = useTransition();

  const history = tracking.history;
  const compare = (a: string, b: string) => {
    setPair({ a, b });
    startCompare(async () => setDiff(await getDiffAction(a, b)));
  };

  return (
    <div className="space-y-8">
      {tracking.runCount < 2 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          <TrendingUp className="mx-auto mb-2 size-6 text-muted-foreground/60" />
          You need at least 2 completed audits to see trends and a “what changed” diff.{" "}
          {tracking.runCount === 0 ? "Run your first audit" : "Run another audit"} or enable scheduled tracking below.
          <div className="mt-3">
            <Link href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>Go to Overview</Link>
          </div>
        </div>
      ) : (
        <TrendCharts trends={tracking.trends} />
      )}

      {/* What changed */}
      {diff && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">What changed</h2>
            {history.length >= 2 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Compare</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-1.5"
                  value={pair?.b ?? history[0].id}
                  onChange={(e) => compare(pair?.a ?? history[1].id, e.target.value)}
                >
                  {history.map((h) => (
                    <option key={h.id} value={h.id}>{new Date(h.createdAt).toLocaleDateString()}</option>
                  ))}
                </select>
                <span>vs</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-1.5"
                  value={pair?.a ?? history[1].id}
                  onChange={(e) => compare(e.target.value, pair?.b ?? history[0].id)}
                >
                  {history.map((h) => (
                    <option key={h.id} value={h.id}>{new Date(h.createdAt).toLocaleDateString()}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {diff.configMismatch && (
            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
              These runs used a different config
              {diff.enginesA.join(",") !== diff.enginesB.join(",")
                ? ` (engines: ${diff.enginesA.join(", ")} → ${diff.enginesB.join(", ")})`
                : ` (samples: ${diff.samplesA} → ${diff.samplesB})`}
              — some changes may reflect the config, not real movement.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Visibility</span><DeltaBadge delta={diff.visibilityDelta} /></div>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Share of voice</span><DeltaBadge delta={diff.shareOfVoiceDelta} /></div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DiffList title="Newly mentioned" tone="positive" items={diff.gainedMentions.map((m) => m.text)} />
            <DiffList title="Lost mentions" tone="negative" items={diff.lostMentions.map((m) => m.text)} />
            <DiffList title="Position improved" tone="positive" items={diff.positionImproved.map((m) => `${m.text} (${m.from}→${m.to})`)} />
            <DiffList title="Position regressed" tone="negative" items={diff.positionRegressed.map((m) => `${m.text} (${m.from}→${m.to})`)} />
            <DiffList title="New cited sources" tone="neutral" items={diff.newDomains} />
            <DiffList title="Lost cited sources" tone="neutral" items={diff.lostDomains} />
          </div>
        </section>
      )}

      {/* Run history */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Run history</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Engines</th>
                <th className="px-4 py-2 font-medium">Visibility</th>
                <th className="px-4 py-2 font-medium">SoV</th>
                <th className="px-4 py-2 font-medium">Cost</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2">{new Date(h.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-xs capitalize text-muted-foreground">{h.engines.join(", ")}</td>
                  <td className="px-4 py-2">{pct(h.scores?.visibilityScore)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{pct(h.scores?.shareOfVoice)}</td>
                  <td className="px-4 py-2 text-muted-foreground">{h.costActualUsd != null ? `$${h.costActualUsd.toFixed(2)}` : "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <Link href={`/app/visibility?run=${h.id}`} className="text-xs text-primary hover:underline">View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ScheduleControl
        schedule={state.schedule}
        availableEngines={state.availableEngines}
        defaultEngines={state.defaultEngines}
        defaultSamples={state.defaultSamples}
        maxSpendPerRunUsd={state.maxSpendPerRunUsd}
        hasResendEnv={state.hasResendEnv}
      />
    </div>
  );
}

function DiffList({ title, items, tone }: { title: string; items: string[]; tone: "positive" | "negative" | "neutral" }) {
  if (items.length === 0) return null;
  const dot = tone === "positive" ? "bg-positive" : tone === "negative" ? "bg-negative" : "bg-muted-foreground";
  return (
    <div className="rounded-lg border border-border p-3">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <span className={cn("inline-block size-2 rounded-full", dot)} />
        {title} <Badge variant="secondary" className="font-normal">{items.length}</Badge>
      </h3>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {items.slice(0, 8).map((t, i) => (
          <li key={i} className="truncate">{t}</li>
        ))}
      </ul>
    </div>
  );
}
