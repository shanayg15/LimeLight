"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Copy, Bot, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { AnalyticsState } from "@/lib/actions/analytics";

export function AnalyticsView({ state }: { state: AnalyticsState }) {
  const { summary } = state;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.snippet);
      setCopied(true);
      toast.success("Snippet copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  };

  const byDay = summary.byDay.map((d) => ({ date: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }), Referrals: d.referrals, "Bot hits": d.bots }));

  return (
    <div className="space-y-8">
      {summary.hasEvents ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserRound className="size-3.5" /> AI human referrals</p>
              <p className="mt-1 text-3xl font-semibold text-primary">{summary.referrals}</p>
              <p className="mt-1 text-xs text-muted-foreground">visitors arriving from AI assistants (30d)</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Bot className="size-3.5" /> AI bot / crawler hits</p>
              <p className="mt-1 text-3xl font-semibold">{summary.bots}</p>
              <p className="mt-1 text-xs text-muted-foreground">known AI crawlers fetching your pages (30d)</p>
            </div>
          </div>

          {byDay.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-medium">Over time</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byDay} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Referrals" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Bot hits" fill="var(--chart-3)" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4">
              <h2 className="mb-2 text-sm font-medium">By engine</h2>
              <ul className="space-y-1.5 text-sm">
                {summary.byEngine.map((e) => (
                  <li key={e.engine} className="flex items-center justify-between">
                    <span className="capitalize text-muted-foreground">{e.engine}</span>
                    <span className="text-xs">{e.referrals} ref · {e.bots} bot</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-border p-4">
              <h2 className="mb-2 text-sm font-medium">Most-crawled pages</h2>
              {summary.topBotPaths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No AI crawler hits yet.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {summary.topBotPaths.map((p) => (
                    <li key={p.path} className="flex items-center justify-between gap-2">
                      <span className="truncate text-muted-foreground">{p.path}</span>
                      <span className="shrink-0 text-xs">×{p.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No analytics yet. Install the snippet on your site (below) and data will appear as AI assistants
          send visitors or crawlers fetch your pages.
        </div>
      )}

      {/* Snippet install — opt-in; we provide it, we never modify your site. */}
      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">Install the tracking snippet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste this once into your site&apos;s <code className="rounded bg-secondary px-1">&lt;head&gt;</code> (or
            your tag manager). It sends only the page path and referrer — no cookies, no personal data. We
            classify AI referrals/crawlers and store coarse, non-PII signals. <strong>You install it; Limelight
            never touches your site.</strong>
          </p>
        </div>
        <div className="relative">
          <pre className="overflow-x-auto rounded-lg border border-border bg-background px-3 py-2.5 pr-12 text-xs">{state.snippet}</pre>
          <button
            onClick={copy}
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
          >
            {copied ? <Check className="size-3.5 text-positive" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className={cn("text-xs text-muted-foreground")}>
          Note: the JS snippet captures human referrals (browsers run it). AI crawlers don&apos;t run JS, so
          bot-traffic rows appear when your server forwards hits to the collector — see the README.
        </p>
      </section>
    </div>
  );
}
