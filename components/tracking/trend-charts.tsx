"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import type { EngineId } from "@/lib/db/schema";
import type { TrendData } from "@/lib/core/tracking";

const ENGINE_COLORS: Record<EngineId, string> = {
  perplexity: "var(--chart-1)",
  openai: "var(--chart-2)",
  gemini: "var(--chart-3)",
  claude: "var(--chart-4)",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function MetricCard({
  title,
  data,
  dataKey,
  unit,
  color,
  invert,
}: {
  title: string;
  data: Record<string, unknown>[];
  dataKey: string;
  unit: "pct" | "num";
  color: string;
  invert?: boolean;
}) {
  const fmt = (v: number) => (unit === "pct" ? `${Math.round(v * 100)}%` : v.toFixed(1));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {invert && <span className="text-[10px] text-muted-foreground">lower is better</span>}
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(v) => fmt(v as number)}
              tickLine={false}
              axisLine={false}
              width={40}
              domain={unit === "pct" ? [0, 1] : invert ? [1, "auto"] : [0, "auto"]}
              reversed={invert}
            />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              formatter={(v) => fmt(v as number)}
            />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function TrendCharts({ trends }: { trends: TrendData }) {
  const [showEngines, setShowEngines] = useState(false);
  const overall = useMemo(() => trends.overall.map((p) => ({ ...p, date: fmtDate(p.date) })), [trends.overall]);

  // Merge per-engine visibility into one dataset keyed by date for the engine view.
  const engineData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    for (const et of trends.perEngine) {
      for (const pt of et.points) {
        const d = fmtDate(pt.date);
        const row = byDate.get(d) ?? { date: d };
        row[et.engine] = pt.visibility;
        byDate.set(d, row);
      }
    }
    return [...byDate.values()];
  }, [trends.perEngine]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Trends</h2>
        {trends.perEngine.length > 1 && (
          <div className="flex gap-1 text-xs">
            <button onClick={() => setShowEngines(false)} className={cn("rounded px-2 py-1", !showEngines ? "bg-secondary text-foreground" : "text-muted-foreground")}>
              Overall
            </button>
            <button onClick={() => setShowEngines(true)} className={cn("rounded px-2 py-1", showEngines ? "bg-secondary text-foreground" : "text-muted-foreground")}>
              Per engine
            </button>
          </div>
        )}
      </div>

      {showEngines ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="mb-1 text-sm font-medium">Visibility by engine</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={engineData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${Math.round((v as number) * 100)}%`} tickLine={false} axisLine={false} width={40} domain={[0, 1]} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} formatter={(v) => `${Math.round((v as number) * 100)}%`} />
                {trends.perEngine.map((et) => (
                  <Line key={et.engine} type="monotone" dataKey={et.engine} name={et.engine} stroke={ENGINE_COLORS[et.engine]} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {trends.perEngine.map((et) => (
              <span key={et.engine} className="inline-flex items-center gap-1.5 capitalize text-muted-foreground">
                <span className="inline-block size-2.5 rounded-full" style={{ background: ENGINE_COLORS[et.engine] }} />
                {et.engine}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard title="Visibility" data={overall} dataKey="visibility" unit="pct" color="var(--chart-1)" />
          <MetricCard title="Share of voice" data={overall} dataKey="shareOfVoice" unit="pct" color="var(--chart-2)" />
          <MetricCard title="Avg position" data={overall} dataKey="avgPosition" unit="num" color="var(--chart-3)" invert />
          <MetricCard title="Citation frequency" data={overall} dataKey="citationFrequency" unit="pct" color="var(--chart-4)" />
        </div>
      )}
    </section>
  );
}
