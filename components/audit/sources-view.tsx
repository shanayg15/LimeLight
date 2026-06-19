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
      <CitationShare domains={domains} />

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

const UGC_DOMAINS = ["reddit.com", "youtube.com", "quora.com", "stackoverflow.com", "stackexchange.com", "news.ycombinator.com", "medium.com", "substack.com", "x.com", "twitter.com", "linkedin.com", "tiktok.com"];
const isUgc = (d: string) => UGC_DOMAINS.some((u) => d === u || d.endsWith(`.${u}`));

/** Citation share by source type — computed from the run's real cited-domain counts. */
function CitationShare({ domains }: { domains: SourceAnalysis["topDomains"] }) {
  const buckets = useMemo(() => {
    let yours = 0;
    let ugc = 0;
    let third = 0;
    for (const d of domains) {
      if (d.isYours) yours += d.count;
      else if (isUgc(d.domain)) ugc += d.count;
      else third += d.count;
    }
    return { yours, ugc, third, total: yours + ugc + third };
  }, [domains]);

  if (buckets.total === 0) return null;
  const seg = [
    { label: "Yours", v: buckets.yours, color: "var(--positive)" },
    { label: "Third-party", v: buckets.third, color: "var(--primary)" },
    { label: "UGC / forums", v: buckets.ugc, color: "var(--chart-3)" },
  ].filter((s) => s.v > 0);

  const C = 2 * Math.PI * 32;
  let acc = 0;
  const yoursPct = Math.round((buckets.yours / buckets.total) * 100);

  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 80 80" className="w-28" role="img" aria-label={`${yoursPct}% of citations are yours`}>
          <circle cx="40" cy="40" r="32" fill="none" stroke="var(--secondary)" strokeWidth="12" />
          {seg.map((s) => {
            const len = (s.v / buckets.total) * C;
            const el = (
              <circle key={s.label} cx="40" cy="40" r="32" fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 40 40)" />
            );
            acc += len;
            return el;
          })}
          <text x="40" y="38" textAnchor="middle" className="fill-foreground" fontSize="15" fontWeight="600">{yoursPct}%</text>
          <text x="40" y="50" textAnchor="middle" className="fill-muted-foreground" fontSize="7">yours</text>
        </svg>
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-semibold">Citation share by source type</h2>
        <p className="text-sm text-muted-foreground">
          Of the {buckets.total} search-grounded citations in this run, {yoursPct}% point to your own domain.
        </p>
        <ul className="mt-3 space-y-1.5">
          {seg.map((s) => (
            <li key={s.label} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              <span className="w-28 text-muted-foreground">{s.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <span className="block h-full rounded-full" style={{ width: `${(s.v / buckets.total) * 100}%`, background: s.color }} />
              </span>
              <span className="w-10 text-right text-xs text-muted-foreground">{Math.round((s.v / buckets.total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
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
