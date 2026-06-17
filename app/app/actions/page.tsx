import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getOpportunitiesState } from "@/lib/actions/opportunities";
import { ActionsView } from "@/components/actions/actions-view";

export const metadata: Metadata = { title: "Actions" };

export default async function ActionsPage() {
  const state = await getOpportunitiesState();

  const empty = !state || (state.opportunities.length === 0 && !state.hasRun && !state.hasSiteAudit);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Actions</h1>
        <p className="text-muted-foreground">
          Ranked, high-leverage moves — <span className="text-foreground">Create</span>,{" "}
          <span className="text-foreground">Improve</span>, <span className="text-foreground">Earn</span>,{" "}
          <span className="text-foreground">Engage</span> — built from your coverage gaps and site
          findings. Every action links to the exact evidence behind it.
        </p>
      </header>

      {empty ? (
        <div className="space-y-3 rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <p>Run an audit and a site audit to generate recommended actions.</p>
          <div className="flex justify-center gap-2">
            <Link href="/app" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Run an audit
            </Link>
            <Link href="/app/site-audit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Audit your site
            </Link>
          </div>
        </div>
      ) : state.opportunities.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No clear opportunities yet — you&apos;re cited where sources appear, or there isn&apos;t enough
          data. Run another audit to gather more signal.
        </div>
      ) : (
        <ActionsView state={state} />
      )}
    </div>
  );
}
