/**
 * Static, illustrative product-preview mockups for the marketing pages. These
 * are clearly previews of the Limelight UI (sample data, never a real user's),
 * mirroring a clean AEO dashboard layout in our own brand.
 */

function BrowserChrome({ tab, children }: { tab: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-900/5">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2">
        <span className="size-2.5 rounded-full bg-zinc-200" />
        <span className="size-2.5 rounded-full bg-zinc-200" />
        <span className="size-2.5 rounded-full bg-zinc-200" />
        <div className="ml-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
          {["Visibility", "Sources", "Actions", "Content", "Tracking", "Analytics"].map((t) => (
            <span key={t} className={t === tab ? "font-medium text-orange-600" : ""}>{t}</span>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

const ENGINE_DOT: Record<string, string> = {
  ChatGPT: "#10a37f",
  Claude: "#d97757",
  Gemini: "#4285f4",
  Perplexity: "#20808d",
};

/** Big visibility board: trend chart + competitor ranking. (hero / Monitor) */
export function VisibilityBoard() {
  const lines: { name: string; color: string; pts: number[] }[] = [
    { name: "You", color: "#ea580c", pts: [40, 44, 41, 52, 58, 55, 63] },
    { name: "ChatGPT", color: "#10a37f", pts: [55, 52, 58, 60, 57, 62, 66] },
    { name: "Claude", color: "#d97757", pts: [30, 34, 33, 38, 42, 45, 47] },
    { name: "Perplexity", color: "#20808d", pts: [62, 60, 65, 68, 70, 72, 80] },
  ];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const W = 360;
  const H = 150;
  const x = (i: number) => 8 + (i * (W - 16)) / (days.length - 1);
  const y = (v: number) => H - 14 - (v / 100) * (H - 28);
  const path = (pts: number[]) => pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const comp = [
    { n: "You", v: "63.0%", d: "+2.7", up: true, you: true },
    { n: "northstar.io", v: "58.2%", d: "-1.1", up: false },
    { n: "flowmetric", v: "46.3%", d: "+0.4", up: true },
    { n: "ridgeline", v: "41.0%", d: "+1.8", up: true },
    { n: "carta apps", v: "30.7%", d: "-2.5", up: false },
  ];

  return (
    <BrowserChrome tab="Visibility">
      <div className="grid gap-3 p-4 md:grid-cols-[1.6fr_1fr]">
        <div className="rounded-lg border border-zinc-100 p-3">
          <div className="mb-1 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-zinc-400">Visibility score</p>
              <p className="text-2xl font-semibold text-zinc-900">
                63.0% <span className="align-middle text-xs font-medium text-emerald-600">+2.7%</span>
              </p>
            </div>
            <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-500">Last 7 days</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {[0, 25, 50, 75, 100].map((g) => (
              <line key={g} x1="8" x2={W - 8} y1={y(g)} y2={y(g)} stroke="#f1f1f3" strokeWidth="1" />
            ))}
            {lines.map((l) => (
              <path key={l.name} d={path(l.pts)} fill="none" stroke={l.color} strokeWidth={l.name === "You" ? 2.4 : 1.6} strokeDasharray={l.name === "You" ? "" : "3 3"} opacity={l.name === "You" ? 1 : 0.7} />
            ))}
            {lines[0].pts.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="2.2" fill="#ea580c" />
            ))}
          </svg>
          <div className="mt-1 flex justify-between px-1 text-[10px] text-zinc-400">
            {days.map((d) => <span key={d}>{d}</span>)}
          </div>
        </div>

        <div className="rounded-lg border border-zinc-100 p-3">
          <p className="mb-2 text-[11px] font-medium text-zinc-500">Competitor ranking</p>
          <ul className="space-y-1.5">
            {comp.map((c, i) => (
              <li key={c.n} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs ${c.you ? "bg-orange-50 ring-1 ring-orange-200" : ""}`}>
                <span className="flex items-center gap-2">
                  <span className="w-3 text-zinc-400">{i + 1}</span>
                  <span className={c.you ? "font-semibold text-orange-700" : "text-zinc-700"}>{c.n}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`text-[10px] ${c.up ? "text-emerald-600" : "text-rose-500"}`}>{c.d}</span>
                  <span className="tabular-nums text-zinc-500">{c.v}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </BrowserChrome>
  );
}

/** Visibility score + an answer/mentions panel. (Monitor) */
export function AnswerCard() {
  const mentions = [
    { r: 1, n: "you", you: true },
    { r: 2, n: "northstar.io" },
    { r: 3, n: "flowmetric.app" },
    { r: 4, n: "ridgeline.dev" },
    { r: 5, n: "carta apps" },
  ];
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-zinc-500">&ldquo;Who are the best tools for AI visibility?&rdquo;</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1.4fr_1fr]">
        <div className="rounded-lg bg-zinc-50 p-3 text-[11px] leading-relaxed text-zinc-600">
          A few options stand out for tracking and improving how AI assistants describe you. The
          strongest pick depends on whether you want monitoring, source analysis, or content tooling —
          and several teams combine them…
        </div>
        <div>
          <p className="mb-1.5 text-[11px] font-medium text-zinc-500">Mentions (5)</p>
          <ul className="space-y-1">
            {mentions.map((m) => (
              <li key={m.r} className="flex items-center gap-2 text-[11px]">
                <span className="w-4 text-zinc-400">#{m.r}</span>
                <span className={m.you ? "font-semibold text-orange-700" : "text-zinc-700"}>{m.n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Citation share donut + top URLs table. (Sources) */
export function SourcesDonut() {
  const seg = [
    { label: "Yours", v: 21, color: "#ea580c" },
    { label: "Editorial", v: 26, color: "#f59e0b" },
    { label: "UGC", v: 19, color: "#14b8a6" },
    { label: "Competitor", v: 18, color: "#6366f1" },
    { label: "Other", v: 16, color: "#a1a1aa" },
  ];
  const C = 2 * Math.PI * 32;
  let acc = 0;
  const urls = [
    { u: "wikipedia.org/wiki/…", t: "Editorial", p: "31%" },
    { u: "you.com/about", t: "Yours", p: "21%" },
    { u: "reddit.com/r/…", t: "UGC", p: "18%" },
    { u: "northstar.io/blog/…", t: "Competitor", p: "12%" },
    { u: "g2.com/categories/…", t: "Editorial", p: "9%" },
  ];
  const tone: Record<string, string> = {
    Yours: "bg-orange-100 text-orange-700",
    Editorial: "bg-amber-100 text-amber-700",
    UGC: "bg-teal-100 text-teal-700",
    Competitor: "bg-indigo-100 text-indigo-700",
  };
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1.5fr]">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] text-zinc-500">Citation share by source type</p>
        <p className="mb-2 text-xl font-semibold text-zinc-900">21% <span className="text-xs font-normal text-zinc-400">yours</span></p>
        <svg viewBox="0 0 80 80" className="mx-auto w-28">
          <circle cx="40" cy="40" r="32" fill="none" stroke="#f4f4f5" strokeWidth="12" />
          {seg.map((s) => {
            const len = (s.v / 100) * C;
            const el = (
              <circle key={s.label} cx="40" cy="40" r="32" fill="none" stroke={s.color} strokeWidth="12" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 40 40)" />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-zinc-500">
          {seg.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ background: s.color }} /> {s.label}
            </span>
          ))}
        </div>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="mb-2 text-[11px] font-medium text-zinc-500">Top cited URLs</p>
        <ul className="divide-y divide-zinc-100 text-xs">
          {urls.map((r, i) => (
            <li key={r.u} className="flex items-center gap-2 py-2">
              <span className="w-3 text-zinc-300">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-zinc-700">{r.u}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${tone[r.t] ?? "bg-zinc-100 text-zinc-500"}`}>{r.t}</span>
              <span className="w-9 text-right tabular-nums text-zinc-500">{r.p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Recommendations / actions panel. (Actions) */
export function ActionsBoard() {
  const recs = [
    { t: "Add FAQPage schema to your answer blocks", d: "Answer engines pull structured Q&A first. Your 8 on-page questions render as plain text today.", tag: "Structure" },
    { t: "Cite primary sources on your pricing page", d: "AI cites source-backed comparisons ~2× more often. Several claims ship without links.", tag: "Authority" },
    { t: "Lead with an answer-first summary", d: "A concise opening paragraph is what gets quoted. Three key pages bury the answer.", tag: "Readability" },
  ];
  const tone: Record<string, string> = {
    Structure: "bg-indigo-50 text-indigo-600 ring-indigo-200",
    Authority: "bg-amber-50 text-amber-700 ring-amber-200",
    Readability: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  };
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2 text-[11px] text-zinc-400">
        <span className="size-3 rounded-full border border-zinc-300" />
        Auditing yoursite.com — readiness 64/100 · 4 recommendations
      </div>
      <ul className="space-y-2.5">
        {recs.map((r) => (
          <li key={r.t} className="rounded-lg border border-zinc-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-zinc-800">{r.t}</p>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ring-1 ${tone[r.tag]}`}>{r.tag}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{r.d}</p>
            <button className="mt-2 rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-medium text-white">Draft the fix</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** AI referrals + bot-traffic panels. (Analytics) */
export function AnalyticsBoard() {
  const refs = [
    { n: "ChatGPT", s: 502, dot: ENGINE_DOT.ChatGPT },
    { n: "Gemini", s: 70, dot: ENGINE_DOT.Gemini },
    { n: "Claude", s: 29, dot: ENGINE_DOT.Claude },
    { n: "Perplexity", s: 23, dot: ENGINE_DOT.Perplexity },
  ];
  const total = refs.reduce((a, b) => a + b.s, 0);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] text-zinc-500">AI human referrals</p>
        <p className="mb-3 text-2xl font-semibold text-zinc-900">{total}</p>
        <ul className="space-y-2">
          {refs.map((r) => (
            <li key={r.n} className="flex items-center gap-2 text-xs">
              <span className="size-2 rounded-full" style={{ background: r.dot }} />
              <span className="w-20 text-zinc-700">{r.n}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <span className="block h-full rounded-full bg-orange-500" style={{ width: `${(r.s / total) * 100}%` }} />
              </span>
              <span className="w-8 text-right tabular-nums text-zinc-500">{r.s}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] text-zinc-500">AI bot / crawler hits</p>
        <p className="mb-3 text-2xl font-semibold text-zinc-900">1.1M</p>
        <ul className="space-y-1.5 text-xs">
          {[
            { p: "/graphql", v: "41,131", pct: "3.6%" },
            { p: "/signup/welcome", v: "36,895", pct: "3.3%" },
            { p: "/robots.txt", v: "29,644", pct: "2.6%" },
            { p: "/pricing", v: "23,678", pct: "2.1%" },
            { p: "/", v: "20,421", pct: "1.8%" },
          ].map((b) => (
            <li key={b.p} className="flex items-center justify-between">
              <span className="text-zinc-700">{b.p}</span>
              <span className="flex items-center gap-3 text-zinc-400">
                <span className="tabular-nums text-zinc-600">{b.v}</span>
                <span className="w-8 text-right">{b.pct}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
