"use client";

import { useState } from "react";
import { PenLine, Wrench, Award, MessagesSquare, ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Impact, Effort, Opportunity, OpportunityKind } from "@/lib/core/actions";
import type { OpportunitiesState } from "@/lib/actions/opportunities";

const KIND_META: Record<OpportunityKind, { label: string; icon: typeof PenLine; blurb: string }> = {
  create: { label: "Create", icon: PenLine, blurb: "Write new citable content" },
  improve: { label: "Improve", icon: Wrench, blurb: "Upgrade existing pages" },
  earn: { label: "Earn", icon: Award, blurb: "Get featured elsewhere" },
  engage: { label: "Engage", icon: MessagesSquare, blurb: "Join the conversation" },
};
const KINDS: OpportunityKind[] = ["create", "improve", "earn", "engage"];

const IMPACT_STYLE: Record<Impact, string> = {
  high: "bg-positive/15 text-positive",
  med: "bg-primary/15 text-primary",
  low: "bg-secondary text-muted-foreground",
};
const EFFORT_LABEL: Record<Effort, string> = { low: "Low effort", med: "Medium effort", high: "High effort" };

export function ActionsView({ state }: { state: OpportunitiesState }) {
  const [filter, setFilter] = useState<OpportunityKind | "all">("all");
  const shown = filter === "all" ? state.opportunities : state.opportunities.filter((o) => o.kind === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All ${state.opportunities.length}`} />
        {KINDS.map((k) => {
          const Icon = KIND_META[k].icon;
          return (
            <FilterChip
              key={k}
              active={filter === k}
              onClick={() => setFilter(k)}
              label={`${KIND_META[k].label} ${state.counts[k]}`}
              icon={<Icon className="size-3.5" />}
            />
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No opportunities in this bucket.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => (
            <OpportunityCard key={o.id} o={o} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary/40 bg-primary/15 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function OpportunityCard({ o }: { o: Opportunity }) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_META[o.kind].icon;
  const isContent = o.kind === "create" || o.kind === "improve";
  const evidenceCount =
    (o.evidence.prompts?.length ?? 0) + (o.evidence.sources?.length ?? 0) + (o.evidence.findings?.length ?? 0);

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal capitalize">
              {KIND_META[o.kind].label}
            </Badge>
            <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", IMPACT_STYLE[o.impact])}>
              {o.impact === "high" ? "High impact" : o.impact === "med" ? "Medium impact" : "Low impact"}
            </span>
            <span className="text-xs text-muted-foreground">{EFFORT_LABEL[o.effort]}</span>
            {o.targetTopic && (
              <Badge variant="secondary" className="font-normal">
                {o.targetTopic}
              </Badge>
            )}
          </div>
          <h3 className="mt-1.5 text-sm font-medium">{o.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{o.rationale}</p>

          {evidenceCount > 0 && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
              {open ? "Hide" : "Show"} evidence ({evidenceCount})
            </button>
          )}
          {open && (
            <div className="mt-2 space-y-2 rounded-lg border border-border bg-background/40 p-3 text-xs">
              {o.evidence.prompts && o.evidence.prompts.length > 0 && (
                <EvidenceRow label="Prompts">
                  {o.evidence.prompts.map((p, i) => (
                    <span key={i} className="block text-muted-foreground">
                      &ldquo;{p}&rdquo;
                    </span>
                  ))}
                </EvidenceRow>
              )}
              {o.evidence.sources && o.evidence.sources.length > 0 && (
                <EvidenceRow label="Cited instead">
                  <span className="flex flex-wrap gap-1.5">
                    {o.evidence.sources.map((s) => (
                      <a
                        key={s}
                        href={`https://${s}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded bg-secondary/60 px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                      >
                        {s}
                        <ExternalLink className="size-2.5" />
                      </a>
                    ))}
                  </span>
                </EvidenceRow>
              )}
              {o.evidence.findings && o.evidence.findings.length > 0 && (
                <EvidenceRow label="Site findings">
                  {o.evidence.findings.map((f, i) => (
                    <span key={i} className="block text-muted-foreground">
                      {f}
                    </span>
                  ))}
                </EvidenceRow>
              )}
            </div>
          )}

          {isContent && (
            <div className="mt-3">
              {/* M5: stubbed entry point. M6 wires this to generateContent. */}
              <button
                disabled
                title="Coming in the content milestone"
                className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground opacity-70"
              >
                <PenLine className="size-3.5" />
                Draft content (coming soon)
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function EvidenceRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-medium text-foreground">{label}:</span> {children}
    </div>
  );
}
