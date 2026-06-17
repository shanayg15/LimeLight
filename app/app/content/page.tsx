import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { listDrafts } from "@/lib/actions/content";

export const metadata: Metadata = { title: "Content" };

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-secondary text-muted-foreground",
  approved: "bg-primary/15 text-primary",
  exported: "bg-positive/15 text-positive",
};

export default async function ContentPage() {
  const drafts = await listDrafts();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Content</h1>
          <p className="text-muted-foreground">
            Brand-aware drafts — article + FAQ + valid JSON-LD — built from your Create/Improve actions.
            Edit them here and export when ready. Nothing publishes automatically.
          </p>
        </div>
        <Link href="/app/actions" className={buttonVariants({ variant: "outline", size: "sm" })}>
          New from action
        </Link>
      </header>

      {drafts.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto size-6 text-muted-foreground/60" />
          <p>No drafts yet. Generate one from a Create or Improve opportunity.</p>
          <div className="flex justify-center">
            <Link href="/app/actions" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Go to Actions
            </Link>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link href={`/app/content/${d.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{d.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Updated {new Date(d.updatedAt).toLocaleDateString()}
                    {d.source === "scaffold" && " · keyless scaffold"}
                  </div>
                </div>
                <Badge variant="outline" className="font-normal capitalize">
                  {d.kind}
                </Badge>
                <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[d.status] ?? ""}`}>
                  {d.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
