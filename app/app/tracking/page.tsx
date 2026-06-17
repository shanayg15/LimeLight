import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getTrackingState } from "@/lib/actions/tracking";
import { TrackingView } from "@/components/tracking/tracking-view";

export const metadata: Metadata = { title: "Tracking" };

export default async function TrackingPage() {
  const state = await getTrackingState();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tracking</h1>
        <p className="text-muted-foreground">
          How your visibility, share of voice, position, and citations move over time — plus exactly what
          changed between runs. Set a schedule to keep it current; opt in to a weekly digest.
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
        <TrackingView state={state} />
      )}
    </div>
  );
}
