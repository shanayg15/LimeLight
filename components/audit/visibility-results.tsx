"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VisibilityData, VisibilityPrompt } from "@/lib/actions/audits";

type MentionFilter = "all" | "mentioned" | "missing";

const SENTIMENT_CLASS: Record<string, string> = {
  positive: "text-positive",
  neutral: "text-neutral",
  negative: "text-negative",
};

function promptIsMentioned(p: VisibilityPrompt): boolean {
  return p.cells.some((c) => c.mentionedSamples > 0);
}

function bestPositionOf(p: VisibilityPrompt): number {
  const positions = p.cells.map((c) => c.bestPosition).filter((x): x is number => x != null);
  return positions.length ? Math.min(...positions) : Number.POSITIVE_INFINITY;
}

export function VisibilityResults({ data }: { data: VisibilityData }) {
  const [mention, setMention] = useState<MentionFilter>("all");
  const [topic, setTopic] = useState<string>("all");
  const [intent, setIntent] = useState<string>("all");
  const [sortByPosition, setSortByPosition] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const topics = useMemo(
    () => [...new Set(data.prompts.map((p) => p.topic).filter((t): t is string => !!t))].sort(),
    [data.prompts],
  );
  const intents = useMemo(
    () => [...new Set(data.prompts.map((p) => p.intent).filter((i): i is string => !!i))].sort(),
    [data.prompts],
  );

  const filtered = useMemo(() => {
    let list = data.prompts.filter((p) => {
      if (mention === "mentioned" && !promptIsMentioned(p)) return false;
      if (mention === "missing" && promptIsMentioned(p)) return false;
      if (topic !== "all" && p.topic !== topic) return false;
      if (intent !== "all" && p.intent !== intent) return false;
      return true;
    });
    if (sortByPosition) list = [...list].sort((a, b) => bestPositionOf(a) - bestPositionOf(b));
    return list;
  }, [data.prompts, mention, topic, intent, sortByPosition]);

  const total = data.prompts.length;
  const mentionedCount = data.prompts.filter(promptIsMentioned).length;

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          {(["all", "mentioned", "missing"] as MentionFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setMention(f)}
              className={cn(
                "px-3 py-1.5 text-sm capitalize transition-colors",
                mention === f ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f === "missing" ? "Not mentioned" : f}
            </button>
          ))}
        </div>

        {topics.length > 0 && (
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {intents.length > 0 && (
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="all">All intents</option>
            {intents.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        )}

        <label className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={sortByPosition}
            onChange={(e) => setSortByPosition(e.target.checked)}
          />
          Sort by position
        </label>
      </div>

      <p className="text-sm text-muted-foreground">
        {mentionedCount} of {total} prompts mention you · showing {filtered.length}
      </p>

      <ul className="space-y-2">
        {filtered.map((p) => {
          const mentioned = promptIsMentioned(p);
          const isOpen = expanded.has(p.promptId);
          return (
            <li
              key={p.promptId}
              className={cn(
                "rounded-lg border border-border",
                !mentioned && "border-l-2 border-l-primary/60",
              )}
            >
              <button
                type="button"
                onClick={() => toggle(p.promptId)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.text}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {p.topic && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {p.topic}
                      </Badge>
                    )}
                    {p.intent && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {p.intent}
                      </Badge>
                    )}
                  </div>
                </div>
                {p.cells.map((c) => (
                  <CellSummary key={c.engine} cell={c} />
                ))}
                <ChevronDown
                  className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                />
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border px-4 py-3">
                  {p.cells.map((c) => (
                    <CellDetail key={c.engine} cell={c} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            No prompts match these filters.
          </li>
        )}
      </ul>
    </div>
  );
}

function CellSummary({ cell }: { cell: VisibilityData["prompts"][number]["cells"][number] }) {
  const mentioned = cell.mentionedSamples > 0;
  return (
    <div className="hidden shrink-0 items-center gap-2 sm:flex">
      {mentioned ? (
        <Badge className="bg-positive/15 text-positive hover:bg-positive/15">
          Mentioned {cell.mentionedSamples}/{cell.totalSamples}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Not mentioned
        </Badge>
      )}
      {mentioned && cell.bestPosition != null && (
        <span className="text-xs text-muted-foreground">#{cell.bestPosition}</span>
      )}
      {mentioned && cell.sentiment && (
        <span className={cn("text-xs", SENTIMENT_CLASS[cell.sentiment])}>{cell.sentiment}</span>
      )}
    </div>
  );
}

function CellDetail({ cell }: { cell: VisibilityData["prompts"][number]["cells"][number] }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground capitalize">{cell.engine}</span>
        <span>·</span>
        <span>
          {cell.mentionedSamples}/{cell.totalSamples} samples mention you
        </span>
        {cell.confidence != null && <span>· confidence {Math.round(cell.confidence * 100)}%</span>}
        {!cell.searchEnabled && <span>· ⚠ not search-grounded</span>}
        {cell.failedSamples > 0 && <span>· {cell.failedSamples} failed</span>}
      </div>

      {cell.answer ? (
        <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-secondary/40 p-3 text-sm text-muted-foreground">
          {cell.answer}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No answer captured.</p>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">
          Sources ({cell.sources.length})
        </div>
        {cell.sources.length === 0 ? (
          <p className="text-xs text-muted-foreground">No citations for this answer.</p>
        ) : (
          <ul className="space-y-1">
            {cell.sources.map((s) => (
              <li key={s.url} className="flex items-center gap-2 text-sm">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-w-0 items-center gap-1.5 text-primary hover:underline"
                >
                  <span className="truncate">{s.title || s.domain}</span>
                  <ExternalLink className="size-3 shrink-0" />
                </a>
                <span className="shrink-0 text-xs text-muted-foreground">{s.domain}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
