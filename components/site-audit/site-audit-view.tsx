"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ReadinessGauge } from "./readiness-gauge";
import { runSiteAuditAction, type SiteAuditState } from "@/lib/actions/site-audit";
import type { SiteAuditArea, SiteAuditFinding, SiteAuditSeverity } from "@/lib/db/schema";

const SEVERITY_STYLE: Record<SiteAuditSeverity, string> = {
  high: "bg-negative/15 text-negative",
  med: "bg-primary/15 text-primary",
  low: "bg-secondary text-muted-foreground",
};
const SEVERITY_LABEL: Record<SiteAuditSeverity, string> = { high: "High", med: "Medium", low: "Low" };
const AREA_LABEL: Record<SiteAuditArea, string> = {
  schema: "Structured data",
  structure: "Answer structure",
  fetchability: "Fetchability",
  entity: "Entity clarity",
  topics: "Topic coverage",
};

export function SiteAuditView({ state }: { state: SiteAuditState }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const audit = state.audit;

  const runAudit = () => {
    start(async () => {
      const res = await runSiteAuditAction();
      if (res.ok) {
        toast.success(`Audited ${res.audit.pagesCrawled} page${res.audit.pagesCrawled === 1 ? "" : "s"}.`);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const RunButton = (
    <Dialog>
      <DialogTrigger className={cn(buttonVariants({ variant: audit ? "outline" : "default", size: "sm" }), "gap-2")} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        {audit ? "Re-run audit" : "Run site audit"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Audit your site</DialogTitle>
          <DialogDescription>
            Limelight will fetch a sample of pages from <span className="text-foreground">{state.siteUrl}</span>{" "}
            (robots-respecting, rate-limited, capped). No data is sent anywhere — we only read your public pages.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </DialogClose>
          <DialogClose className={cn(buttonVariants())} onClick={runAudit}>
            Fetch &amp; audit
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!audit) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          No site audit yet. Run one to score how AI-readable your site is and get specific fixes.
        </p>
        <div className="mt-4 flex justify-center">{RunButton}</div>
      </div>
    );
  }

  const grouped = groupBySeverity(audit.findings);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-6">
          <ReadinessGauge score={audit.aiReadinessScore} readable={audit.readable} />
          <div className="space-y-1">
            <h2 className="text-base font-semibold">AI-readiness</h2>
            <p className="text-sm text-muted-foreground">
              {audit.pagesCrawled} page{audit.pagesCrawled === 1 ? "" : "s"} crawled ·{" "}
              {new Date(audit.crawledAt).toLocaleDateString()}
            </p>
            {!audit.readable && (
              <p className="flex items-center gap-1.5 text-xs text-negative">
                <AlertTriangle className="size-3.5" /> We couldn&apos;t read server-rendered content.
              </p>
            )}
            {audit.notes && <p className="text-xs text-muted-foreground">{audit.notes}</p>}
          </div>
        </div>
        <div className="shrink-0">{RunButton}</div>
      </div>

      {audit.findings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No findings — your site looks AI-ready. 🎉
        </p>
      ) : (
        <div className="space-y-5">
          {(["high", "med", "low"] as SiteAuditSeverity[]).map((sev) =>
            grouped[sev].length === 0 ? null : (
              <section key={sev} className="space-y-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("rounded-md px-1.5 py-0.5 text-xs", SEVERITY_STYLE[sev])}>
                    {SEVERITY_LABEL[sev]}
                  </span>
                  <span className="text-muted-foreground">
                    {grouped[sev].length} finding{grouped[sev].length === 1 ? "" : "s"}
                  </span>
                </h3>
                <ul className="space-y-2">
                  {grouped[sev].map((f) => (
                    <li key={f.id} className="rounded-lg border border-border px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{f.message}</p>
                        <Badge variant="outline" className="shrink-0 font-normal">
                          {AREA_LABEL[f.area]}
                        </Badge>
                      </div>
                      {f.evidence && <p className="mt-1 text-sm text-muted-foreground">{f.evidence}</p>}
                      {f.pages && f.pages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {f.pages.slice(0, 4).map((p) => (
                            <a
                              key={p}
                              href={p}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="truncate rounded bg-secondary/60 px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              {shortPath(p)}
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function groupBySeverity(findings: SiteAuditFinding[]): Record<SiteAuditSeverity, SiteAuditFinding[]> {
  const out: Record<SiteAuditSeverity, SiteAuditFinding[]> = { high: [], med: [], low: [] };
  for (const f of findings) out[f.severity].push(f);
  return out;
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
