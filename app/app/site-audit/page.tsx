import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getSiteAuditState } from "@/lib/actions/site-audit";
import { SiteAuditView } from "@/components/site-audit/site-audit-view";

export const metadata: Metadata = { title: "Site audit" };

export default async function SiteAuditPage() {
  const state = await getSiteAuditState();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Site audit</h1>
        <p className="text-muted-foreground">
          How AI-readable your site is — schema, answer structure, fetchability, entity clarity, and
          topic coverage — with specific, fixable findings. We fetch politely (robots-respecting,
          rate-limited, capped) and never inflate the score.
        </p>
      </header>

      {!state ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Set up a subject first.{" "}
          <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Start onboarding
          </Link>
        </div>
      ) : !state.siteUrl ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          No site URL set for <span className="text-foreground">{state.subjectName}</span>. Add one to
          audit your site.{" "}
          <Link href="/app/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Go to Settings
          </Link>
        </div>
      ) : (
        <SiteAuditView state={state} />
      )}
    </div>
  );
}
