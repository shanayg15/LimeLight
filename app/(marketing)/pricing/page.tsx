import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing — Limelight",
  description: "Free and open-source (self-host, bring your own keys) or a hosted Pro plan for managed runs, scheduled tracking, and weekly digests.",
};

const TIERS = [
  {
    name: "Free / Self-host",
    price: "$0",
    sub: "MIT-licensed, forever",
    cta: { label: "Get started", href: "/signup" },
    highlight: false,
    blurb: "Clone the repo, run it locally with Docker Postgres, and bring your own model keys. The whole product — nothing held back.",
    features: [
      "Every feature: audits, sources, site audit, actions, content, tracking, assistant",
      "Bring your own keys (Perplexity / OpenAI / Gemini / Anthropic), encrypted at rest",
      "You pay only your own provider costs",
      "Run on your own machine — your data never leaves it",
      "Export to Markdown / HTML / JSON-LD",
    ],
  },
  {
    name: "Pro (hosted)",
    price: "$19",
    sub: "per month — hosted convenience",
    cta: { label: "Get started", href: "/signup" },
    highlight: true,
    blurb: "Same open-source app, hosted for you — so you skip the setup and let scheduled runs happen in the background.",
    features: [
      "Everything in Free / Self-host",
      "Managed hosting — no Docker, no deploy",
      "Scheduled tracking runs in the background",
      "Weekly email digests of what changed",
      "Still bring your own model keys — you pay provider costs",
    ],
  },
];

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">Honest pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Limelight is open-source. Self-host it for free with your own keys, or let us host it. No seats, no
          contracts, no &ldquo;contact sales.&rdquo; You always bring your own model keys, so you only ever pay
          your providers for what you run.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {TIERS.map((t) => (
          <div
            key={t.name}
            className={cn(
              "flex flex-col rounded-2xl border p-7",
              t.highlight ? "border-primary/50 bg-card ring-1 ring-primary/20" : "border-border bg-card",
            )}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t.name}</h2>
              {t.highlight && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Hosted</span>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold">{t.price}</span>
              <span className="text-sm text-muted-foreground">{t.sub}</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t.blurb}</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {t.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href={t.cta.href}
              className={cn(buttonVariants({ variant: t.highlight ? "default" : "outline", size: "lg" }), "mt-6")}
            >
              {t.cta.label}
            </Link>
          </div>
        ))}
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        Prefer to run it yourself?{" "}
        <a href="https://github.com/shanayg15/LimeLight" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          The full source is on GitHub
        </a>{" "}
        under the MIT license.
      </p>
    </section>
  );
}
