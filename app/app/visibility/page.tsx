import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getVisibilityData } from "@/lib/actions/audits";
import { VisibilityResults } from "@/components/audit/visibility-results";

export const metadata: Metadata = { title: "Visibility" };

export default async function VisibilityPage() {
  const data = await getVisibilityData();

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Visibility</h1>
        <p className="text-muted-foreground">No audit yet. Run one to see how AI talks about you.</p>
        <Link href="/app" className={buttonVariants()}>
          Go to Overview
        </Link>
      </div>
    );
  }

  const failed = data.run.status === "failed";
  const inProgress = data.run.status === "queued" || data.run.status === "running";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Visibility</h1>
        <p className="text-muted-foreground">
          Per-prompt results — where AI mentions you, where it doesn&apos;t, and the sources it cites.
          {data.run.finishedAt ? ` Run ${new Date(data.run.finishedAt).toLocaleString()}.` : ""}
        </p>
      </header>

      {failed ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-12 text-center text-sm text-destructive">
          This run failed{data.run.error ? `: ${data.run.error}` : ""}. Try running again from the
          Overview.
        </div>
      ) : data.prompts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {inProgress
            ? "Audit in progress — results will appear here as prompts complete."
            : "No results captured for this run."}
        </div>
      ) : (
        <VisibilityResults data={data} />
      )}
    </div>
  );
}
