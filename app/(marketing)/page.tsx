import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Link2, Sparkles, TrendingUp, Search, FileText, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Limelight — See how AI talks about you",
  description:
    "Limelight runs the questions people ask ChatGPT, Claude, Gemini, and Perplexity, then shows when you're mentioned, which sources get cited, and how to get cited too. Open-source, bring your own keys.",
};

const ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity"];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pt-20 pb-10 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 mx-auto h-72 max-w-xl rounded-full bg-primary/15 blur-3xl"
        />
        <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
          Open-source · bring your own model keys
        </p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
          See how AI talks about you
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          Type your name into ChatGPT and you&apos;ll wonder what it really says. Limelight runs the
          questions people actually ask AI assistants, then shows you when you&apos;re mentioned, which
          sources get cited, and exactly how to get cited too.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/signup" className={buttonVariants({ size: "lg" })}>
            Get started
          </Link>
          <Link href="#how" className={buttonVariants({ variant: "outline", size: "lg" })}>
            How it works
          </Link>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {ENGINES.map((e) => (
            <span key={e} className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary/70" /> {e}
            </span>
          ))}
        </div>
      </section>

      {/* Illustrative dashboard preview (clearly a sample — not anyone's real data) */}
      <section className="mx-auto max-w-4xl px-6 pb-16">
        <SampleDashboard />
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-4xl scroll-mt-20 px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">How it works</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Search, t: "1 · Set your subject", d: "Add your name or product, your site, and the topics you want to be known for." },
            { icon: Eye, t: "2 · Run an audit", d: "We ask a curated prompt set across the engines and detect when you're mentioned." },
            { icon: Link2, t: "3 · See the sources", d: "Find the domains and pages AI cites for your topics — and where you're absent." },
            { icon: Sparkles, t: "4 · Take action", d: "Get ranked moves and generate citable content with valid schema." },
          ].map((s) => (
            <div key={s.t} className="rounded-xl border border-border bg-card p-5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <s.icon className="size-4" />
              </span>
              <h3 className="mt-3 text-sm font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature pillars */}
      <section className="mx-auto max-w-5xl space-y-4 px-6 py-8">
        <Feature
          icon={Eye}
          kicker="Monitor"
          title="Track how AI answers across every engine"
          body="Run the same prompt set through ChatGPT, Claude, Gemini, and Perplexity, N samples each. We detect whether you're mentioned, where you rank among named entities, and the sentiment — with the exact answer stored so it's never a black box."
          points={["Visibility score & share of voice vs. competitors", "Per-prompt drill-down with the real answers", "Search-grounded — real citations, never hallucinated"]}
        />
        <Feature
          icon={Link2}
          kicker="Find who gets cited"
          title="See the sources AI trusts for your topics"
          body="Aggregate the cited URLs and domains across a run to find what actually earns citations — and your coverage gaps: the prompts where third parties get cited and you don't."
          points={["Top domains & pages, yours vs. third-party", "Coverage gaps tied to specific prompts", "Per-engine source breakdown"]}
          flip
        />
        <Feature
          icon={Sparkles}
          kicker="Take action"
          title="Create, Improve, Earn, Engage"
          body="Turn gaps into ranked, evidence-backed moves. For Create and Improve, generate a brand-aware article + FAQ + valid JSON-LD schema, grounded in what earns citations — then export it. Nothing publishes without your confirmation."
          points={["Ranked opportunities, each linked to its evidence", "Brand-aware drafts with valid schema", "Export to Markdown / HTML / JSON-LD — no auto-publish"]}
        />
        <Feature
          icon={TrendingUp}
          kicker="Track over time"
          title="Watch your visibility move"
          body="Re-run on a schedule and chart visibility, share of voice, position, and citation frequency over time. See exactly what changed between runs, and opt in to a weekly email digest."
          points={["Trend charts, overall and per engine", "Run-to-run “what changed” diffs", "Optional weekly digest — opt-in, one-click off"]}
          flip
        />
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">Questions</h2>
        <dl className="mt-8 divide-y divide-border">
          {FAQ.map((f) => (
            <div key={f.q} className="py-5">
              <dt className="font-medium">{f.q}</dt>
              <dd className="mt-1.5 text-sm text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
        <div className="rounded-2xl border border-border bg-card p-10">
          <FileText className="mx-auto size-7 text-primary" />
          <h2 className="mt-4 text-2xl font-semibold tracking-tight">Find out what AI says about you</h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            It&apos;s open-source and you bring your own model keys — so your data and costs stay yours.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Get started
            </Link>
            <Link href="/pricing" className={buttonVariants({ variant: "outline", size: "lg" })}>
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Feature({
  icon: Icon,
  kicker,
  title,
  body,
  points,
  flip,
}: {
  icon: typeof Eye;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-6 rounded-2xl border border-border bg-card p-6 sm:p-8 md:grid-cols-2">
      <div className={cn(flip && "md:order-2")}>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-primary">
          <Icon className="size-4" /> {kicker}
        </span>
        <h3 className="mt-2 text-xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 text-muted-foreground">{body}</p>
      </div>
      <ul className={cn("space-y-2", flip && "md:order-1")}>
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2 rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A clearly-labeled, illustrative sample — NOT a real user's data. */
function SampleDashboard() {
  const bars = [
    { e: "ChatGPT", v: 72 },
    { e: "Claude", v: 58 },
    { e: "Gemini", v: 41 },
    { e: "Perplexity", v: 80 },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Illustrative sample
        </span>
      </div>
      <div className="grid gap-5 p-6 sm:grid-cols-3">
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Visibility score</p>
          <p className="mt-1 text-3xl font-semibold text-primary">63%</p>
          <p className="mt-1 text-xs text-muted-foreground">mentioned in 19 / 30 prompts</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Share of voice</p>
          <p className="mt-1 text-3xl font-semibold">38%</p>
          <p className="mt-1 text-xs text-muted-foreground">vs. 3 competitors</p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Avg. position</p>
          <p className="mt-1 text-3xl font-semibold">2.4</p>
          <p className="mt-1 text-xs text-muted-foreground">among named entities</p>
        </div>
        <div className="rounded-xl border border-border p-4 sm:col-span-3">
          <p className="mb-3 text-xs text-muted-foreground">Visibility by engine</p>
          <div className="space-y-2">
            {bars.map((b) => (
              <div key={b.e} className="flex items-center gap-3 text-xs">
                <span className="w-20 text-muted-foreground">{b.e}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${b.v}%` }} />
                </span>
                <span className="w-8 text-right text-muted-foreground">{b.v}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const FAQ = [
  {
    q: "Which prompts should I track, and how many?",
    a: "Start with the natural-language questions people actually ask about your space — Limelight drafts ~15–30 from your topics and you curate them. Keep them specific; vague prompts give vague signal.",
  },
  {
    q: "Do I need my own API keys?",
    a: "Yes — bring your own keys for the engines you enable (Perplexity, OpenAI, Gemini, Anthropic). They're encrypted at rest, and you pay your own provider costs. We never fabricate results: a real, search-grounded engine is required.",
  },
  {
    q: "Will this hurt my SEO?",
    a: "No. Limelight reads your public pages politely (robots-respecting) and the content it generates is standard, valid structured data (JSON-LD) and answer-first writing — the same things that help both search and answer engines. Nothing is published without your confirmation.",
  },
  {
    q: "How long until I see change?",
    a: "Answer engines update on their own cadence, so treat this as ongoing. Run on a schedule, watch the trend, and act on the gaps — visibility moves as your content gets cited.",
  },
  {
    q: "How is visibility measured?",
    a: "Visibility = the share of your prompts where you're mentioned in at least one sample. Share of voice = your mentions ÷ (you + your competitors). We run multiple samples at low temperature and store every raw answer, so the numbers are ranges, not a single lucky roll.",
  },
  {
    q: "Is it really open-source?",
    a: "Yes — MIT-licensed. Run it locally with Docker Postgres and your own keys, or use a hosted Pro plan for managed runs and scheduled tracking.",
  },
];
