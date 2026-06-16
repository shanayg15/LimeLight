"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SourceAnalysis } from "@/lib/core/sources";
import type { EngineId } from "@/lib/db/schema";

export function SourcesView({ data }: { data: SourceAnalysis }) {
  const enginesPresent = useMemo(() => {
    const set = new Set<EngineId>();
    data.topDomains.forEach((d) => d.engines.forEach((e) => set.add(e)));
    return [...set];
  }, [data.topDomains]);

  const [engine, setEngine] = useState<EngineId | "all">("all");
  const match = (engines: EngineId[]) => engine === "all" || engines.includes(engine);

  const domains = data.topDomains.filter((d) => match(d.engines));
  const urls = data.topUrls.filter((u) => match(u.engines));

  return (
    <div className="space-y-8">
      {enginesPresent.length > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Engine:</span>
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as EngineId | "all")}
            className="h-9 rounded-md border border-input bg-background px-2 capitalize"
          >
            <option value="all">All engines</option>
            {enginesPresent.map((e) => (
              <option key={e} value={e} className="capitalize">
                {e}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Coverage gaps */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Your coverage gaps</h2>
          <p className="text-sm text-muted-foreground">
            Prompts where AI cites third-party sources but never you — the places you could be earning
            citations. (These become recommended actions in a later milestone.)
          </p>
        </div>
        {data.coverageGaps.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No clear gaps — either you&apos;re cited where sources appear, or there aren&apos;t enough
            cited prompts yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.coverageGaps.slice(0, 12).map((g) => (
              <li key={g.promptId} className="rounded-lg border border-l-2 border-border border-l-primary/60 px-4 py-3">
                <div className="text-sm font-medium">{g.promptText}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {g.topic && <Badge variant="outline" className="font-normal">{g.topic}</Badge>}
                  <span>cited instead:</span>
                  {g.competingDomains.map((d) => (
                    <Badge key={d} variant="secondary" className="font-normal">
                      {d}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Top domains */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Top cited domains</h2>
        <SourceTable
          rows={domains.map((d) => ({
            primary: d.domain,
            isYours: d.isYours,
            count: d.count,
            prompts: d.prompts,
            engines: d.engines,
          }))}
        />
      </section>

      {/* Top URLs */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Top cited pages</h2>
        {urls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cited pages for this filter.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {urls.map((u) => (
              <li key={u.url} className="flex items-center gap-3 px-4 py-2.5">
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <span className="truncate">{u.title || u.url}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                {u.isYours && <Badge className="bg-positive/15 text-positive hover:bg-positive/15">Yours</Badge>}
                <span className="shrink-0 text-xs text-muted-foreground">{u.domain}</span>
                <span className="shrink-0 text-xs text-muted-foreground">×{u.count}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SourceTable({
  rows,
}: {
  rows: { primary: string; isYours: boolean; count: number; prompts: number; engines: EngineId[] }[];
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No cited domains for this filter.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-secondary/40 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Domain</th>
            <th className="px-4 py-2 font-medium">Citations</th>
            <th className="px-4 py-2 font-medium">Prompts</th>
            <th className="px-4 py-2 font-medium">Engines</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.primary}>
              <td className="px-4 py-2">
                <span className="inline-flex items-center gap-2">
                  {r.primary}
                  {r.isYours && (
                    <Badge className="bg-positive/15 text-positive hover:bg-positive/15">Yours</Badge>
                  )}
                </span>
              </td>
              <td className="px-4 py-2 text-muted-foreground">{r.count}</td>
              <td className="px-4 py-2 text-muted-foreground">{r.prompts}</td>
              <td className={cn("px-4 py-2 text-xs capitalize text-muted-foreground")}>
                {r.engines.join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
