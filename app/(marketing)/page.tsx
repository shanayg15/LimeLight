import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, Link2, Sparkles, TrendingUp } from "lucide-react";
import { VisibilityBoard, AnswerCard, SourcesDonut, ActionsBoard, AnalyticsBoard } from "@/components/marketing/mockups";

export const metadata: Metadata = {
  title: "Limelight — See how AI talks about you",
  description:
    "Limelight shows when ChatGPT, Claude, Gemini, and Perplexity mention you, which sources they cite, and the highest-leverage moves to win citations. Open-source, bring your own keys.",
};

const ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity"];

export default function LandingPage() {
  return (
    <div className="[--dots:radial-gradient(circle,rgba(234,88,12,0.22)_1px,transparent_1px)]">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-200">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[image:var(--dots)] [background-size:22px_22px] opacity-50" />
        <div aria-hidden className="absolute inset-x-0 -top-24 -z-10 mx-auto h-72 max-w-2xl rounded-full bg-orange-300/20 blur-3xl" />
        <div className="mx-auto max-w-6xl px-6 pt-20 pb-12">
          <div className="grid items-end gap-8 md:grid-cols-[1.2fr_1fr]">
            <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight text-zinc-900 md:text-6xl">
              The visibility layer for the AI web
            </h1>
            <div className="space-y-5">
              <p className="text-lg text-zinc-600">
                See when AI assistants mention you, which sources they cite, and the highest-leverage
                moves to win more citations — across <span className="font-medium text-zinc-900">ChatGPT, Claude, Gemini, and Perplexity</span>.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup" className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-5 py-2.5 font-medium text-white shadow-sm transition-colors hover:bg-orange-700">
                  Get started <ArrowRight className="size-4" />
                </Link>
                <Link href="#how" className="rounded-lg border border-zinc-300 px-5 py-2.5 font-medium text-zinc-700 transition-colors hover:bg-white">
                  How it works
                </Link>
                <span className="text-sm text-zinc-400">[ Open-source · MIT ]</span>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <VisibilityBoard />
          </div>
        </div>
      </section>

      {/* Trust row — the engines (no fake customer logos) */}
      <section className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-6 py-7 text-sm text-zinc-400">
          <span>Tracks every major answer engine:</span>
          {ENGINES.map((e) => (
            <span key={e} className="font-medium text-zinc-600">{e}</span>
          ))}
        </div>
      </section>

      {/* Warm gradient CTA band */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-white via-orange-50 to-orange-200" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 mx-auto h-64 max-w-3xl bg-[image:var(--dots)] [background-size:20px_20px] opacity-60" />
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-balance text-4xl font-semibold tracking-tight text-zinc-900">
            See where <span className="text-orange-600">you</span> get mentioned by AI
          </h2>
          <p className="mt-3 text-zinc-600">Check your AI visibility and start taking action — in minutes.</p>
          <div className="mx-auto mt-6 flex max-w-md items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-sm">
            <span className="flex-1 px-3 text-left text-sm text-zinc-400">your name or brand</span>
            <Link href="/signup" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
              Start free
            </Link>
          </div>
        </div>
      </section>

      {/* Monitor */}
      <FeatureBlock
        id="how"
        eyebrow="AI Monitoring"
        icon={Eye}
        title={<>Monitor your <span className="text-orange-600">AI presence</span> and benchmark against competitors</>}
        body="Run a curated prompt set across every engine, N samples each. Track visibility and share of voice over time, see exactly which prompts mention you, and benchmark against the rivals you choose — with the real answers stored, never a black box."
        cta="Get a visibility report"
      >
        <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
          <GradientCard
            kicker="AI Search Analytics"
            text="Track visibility across ChatGPT, Claude, Gemini, and Perplexity. Watch your share of voice move in real time."
          />
          <AnswerCard />
        </div>
      </FeatureBlock>

      {/* Sources */}
      <FeatureBlock
        eyebrow="Source Analytics"
        icon={Link2}
        title={<>Know exactly which <span className="text-orange-600">sources</span> AI trusts</>}
        body="Aggregate every cited URL and domain across a run to find what actually earns citations — split by source type and by yours vs. third-party — so you know where to invest and where you're absent."
        cta="Find top-performing content"
        flip
      >
        <SourcesDonut />
      </FeatureBlock>

      {/* Actions */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-zinc-900 md:text-4xl">
            Take on-page and off-page action with <span className="text-orange-600">Limelight Actions</span>
          </h2>
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 p-1 text-sm">
            {[
              { l: "Create", c: "bg-emerald-500" },
              { l: "Improve", c: "bg-indigo-500", on: true },
              { l: "Earn", c: "bg-amber-500" },
              { l: "Engage", c: "bg-fuchsia-500" },
            ].map((t) => (
              <span key={t.l} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 ${t.on ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-500"}`}>
                <span className={`size-1.5 rounded-full ${t.c}`} /> {t.l}
              </span>
            ))}
          </div>
          <div className="mx-auto mt-8 max-w-3xl text-left">
            <ActionsBoard />
          </div>
          <p className="mx-auto mt-5 max-w-xl text-sm text-zinc-500">
            Every move is ranked and tied to the exact prompts and sources behind it. For Create/Improve,
            generate a brand-aware draft with valid JSON-LD — and export it. Nothing publishes without your confirmation.
          </p>
        </div>
      </section>

      {/* Analytics */}
      <FeatureBlock
        eyebrow="Agent Analytics"
        icon={TrendingUp}
        title={<>Measure the <span className="text-orange-600">ROI</span> of AI search</>}
        body="See real visitors arriving from ChatGPT, Gemini, Perplexity, and Claude — and which AI crawlers are fetching your pages, how often, and where. Install one opt-in snippet; we store no personal data."
        cta="Start measuring AI traffic"
        flip
      >
        <AnalyticsBoard />
      </FeatureBlock>

      {/* FAQ */}
      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-zinc-900">Questions</h2>
          <dl className="mt-8 divide-y divide-zinc-200">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-medium text-zinc-900">{f.q}</dt>
                <dd className="mt-1.5 text-sm text-zinc-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden bg-gradient-to-b from-orange-500 to-amber-400">
        <div aria-hidden className="absolute inset-0 bg-[image:radial-gradient(circle,rgba(255,255,255,.25)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />
        <div className="relative mx-auto max-w-3xl px-6 py-20 text-center text-white">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Find out what AI says about you
          </h2>
          <p className="mx-auto mt-3 max-w-md text-white/90">Open-source, bring your own keys — your data and costs stay yours.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link href="/signup" className="rounded-lg bg-white px-5 py-2.5 font-medium text-orange-700 shadow-sm hover:bg-orange-50">
              Get started
            </Link>
            <Link href="/pricing" className="rounded-lg border border-white/40 px-5 py-2.5 font-medium text-white hover:bg-white/10">
              See pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function GradientCard({ kicker, text }: { kicker: string; text: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 p-5 text-white shadow-sm">
      <div aria-hidden className="absolute inset-0 bg-[image:radial-gradient(circle,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:18px_18px] opacity-40" />
      <div className="relative">
        <Sparkles className="size-4" />
        <h3 className="mt-3 text-base font-semibold">{kicker}</h3>
        <p className="mt-1.5 text-sm text-white/90">{text}</p>
      </div>
    </div>
  );
}

function FeatureBlock({
  id,
  eyebrow,
  icon: Icon,
  title,
  body,
  cta,
  flip,
  children,
}: {
  id?: string;
  eyebrow: string;
  icon: typeof Eye;
  title: React.ReactNode;
  body: string;
  cta: string;
  flip?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-zinc-200 bg-zinc-50">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className={`grid items-center gap-10 lg:grid-cols-2 ${flip ? "" : ""}`}>
          <div className={flip ? "lg:order-2" : ""}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-600">
              <Icon className="size-4" /> {eyebrow}
            </span>
            <h2 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-zinc-900">{title}</h2>
            <p className="mt-3 text-zinc-600">{body}</p>
            <Link href="/signup" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700">
              {cta} <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className={flip ? "lg:order-1" : ""}>{children}</div>
        </div>
      </div>
    </section>
  );
}

const FAQ = [
  {
    q: "Which prompts should I track, and how many?",
    a: "Start with the natural-language questions people actually ask about your space — Limelight drafts ~15–30 from your topics and you curate them. Specific prompts give specific signal.",
  },
  {
    q: "Do I need my own API keys?",
    a: "Yes — bring your own keys for the engines you enable. They're encrypted at rest and you pay your own provider costs. We never fabricate results: a real, search-grounded engine is required.",
  },
  {
    q: "Will this hurt my SEO?",
    a: "No. Limelight reads your public pages politely (robots-respecting), and the content it generates is valid structured data and answer-first writing — the same things that help search and answer engines. Nothing publishes without your confirmation.",
  },
  {
    q: "How long until I see change?",
    a: "Answer engines update on their own cadence, so treat this as ongoing. Run on a schedule, watch the trend, and act on the gaps — visibility moves as your content gets cited.",
  },
  {
    q: "How is visibility measured?",
    a: "Visibility = the share of your prompts where you're mentioned in at least one sample. Share of voice = your mentions ÷ (you + your competitors). We run multiple samples and store every raw answer, so the numbers are ranges, not a lucky roll.",
  },
  {
    q: "Is it really open-source?",
    a: "Yes — MIT-licensed. Run it locally with Docker Postgres and your own keys, or use a hosted Pro plan for managed runs and scheduled tracking.",
  },
];
