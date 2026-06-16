import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSourcesData } from "@/lib/actions/audits";
import { SourcesView } from "@/components/audit/sources-view";

export const metadata: Metadata = { title: "Sources" };

export default async function SourcesPage() {
  const data = await getSourcesData();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
        <p className="text-muted-foreground">
          Which domains and pages AI cites for your topics, who wins vs. you, and where you&apos;re
          absent. Only search-grounded citations count — non-grounded engines can&apos;t inject sources.
        </p>
      </header>

      {!data || !data.hasSearchEnabledCitations ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          {!data
            ? "No audit yet."
            : "No search-grounded citations in the latest run yet."}{" "}
          <Link href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Go to Overview
          </Link>
        </div>
      ) : (
        <SourcesView data={data} />
      )}
    </div>
  );
}
