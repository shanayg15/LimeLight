import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const engines = ["ChatGPT", "Claude", "Gemini", "Perplexity"];

export default function LandingPage() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        Open-source · bring your own model keys
      </p>
      <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
        See how AI talks about you
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
        Limelight runs the questions real people ask AI assistants, then shows you when
        you&apos;re mentioned, which sources get cited, and how to get cited too.
      </p>

      <div className="mt-8 flex items-center justify-center gap-3">
        <Link href="/signup" className={buttonVariants({ size: "lg" })}>
          Get started
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Log in
        </Link>
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        {engines.map((e) => (
          <span key={e} className="inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            {e}
          </span>
        ))}
      </div>

      <p className="mt-12 text-xs text-muted-foreground">
        This is the M1 foundation — the full landing page and audit flow land in later milestones.
      </p>
    </section>
  );
}
