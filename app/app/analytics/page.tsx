import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getAnalyticsState } from "@/lib/actions/analytics";
import { AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const state = await getAnalyticsState();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Agent analytics</h1>
        <p className="text-muted-foreground">
          The ROI side: real visitors arriving from AI assistants, and which AI crawlers are fetching your
          pages. Install a tiny opt-in snippet on your own site — it stores no personal data.
        </p>
      </header>

      {!state ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Set up a subject first.{" "}
          <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Start onboarding
          </Link>
        </div>
      ) : (
        <AnalyticsView state={state} />
      )}
    </div>
  );
}
