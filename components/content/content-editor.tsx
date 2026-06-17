"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Download, RefreshCw, Save, Trash2, Plus, Loader2, Eye, Code } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import type { ContentDraft, FaqItem } from "@/lib/db/schema";
import type { SchemaValidation } from "@/lib/schema";
import type { ExportFormat } from "@/lib/core/content-export";
import {
  deleteDraft,
  exportDraftAction,
  regenerateDraftAction,
  regenerateSchemaAction,
  saveDraft,
} from "@/lib/actions/content";

function escapeHtml(s: string) {
  // Escape the double-quote too — link URLs are injected into href="..." and a
  // stray quote would let markdown like [x](https://a" onmouseover="…) inject an attribute.
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/** Minimal, safe Markdown preview (headings, lists, paragraphs, bold/italic/links). */
function mdPreview(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const inl = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/_([^_]+)_/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const fp = () => { if (para.length) { out.push(`<p>${inl(para.join(" "))}</p>`); para = []; } };
  const fl = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inl(l)}</li>`).join("")}</ul>`); list = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const li = line.match(/^[-*]\s+(.*)$/);
    if (h) { fp(); fl(); out.push(`<h${h[1].length}>${inl(h[2])}</h${h[1].length}>`); }
    else if (li) { fp(); list.push(li[1]); }
    else if (!line.trim()) { fp(); fl(); }
    else { fl(); para.push(line); }
  }
  fp(); fl();
  return out.join("\n");
}

export function ContentEditor({ draft, validation }: { draft: ContentDraft; validation: SchemaValidation }) {
  const router = useRouter();
  const [title, setTitle] = useState(draft.title);
  const [bodyMd, setBodyMd] = useState(draft.bodyMd);
  const [faq, setFaq] = useState<FaqItem[]>(draft.faq);
  const [valid, setValid] = useState(validation);
  const [jsonLd, setJsonLd] = useState(draft.jsonLd);
  const [status, setStatus] = useState(draft.status);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [saving, startSave] = useTransition();
  const [busy, startBusy] = useTransition();

  const dirty = useMemo(
    () => title !== draft.title || bodyMd !== draft.bodyMd || JSON.stringify(faq) !== JSON.stringify(draft.faq),
    [title, bodyMd, faq, draft],
  );

  // Unsaved-changes guard.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const onSave = () =>
    startSave(async () => {
      try {
        const res = await saveDraft(draft.id, { title, bodyMd, faq });
        setValid(res.validation);
        toast.success("Saved.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Save failed.");
      }
    });

  const onRegenerateSchema = () =>
    startBusy(async () => {
      try {
        const res = await regenerateSchemaAction(draft.id);
        setJsonLd(res.jsonLd);
        setValid(res.validation);
        toast.success("Schema regenerated.");
      } catch {
        toast.error("Couldn't regenerate schema.");
      }
    });

  const onRegenerateDraft = () =>
    startBusy(async () => {
      const res = await regenerateDraftAction(draft.id);
      if (res.ok) {
        toast.success("Draft regenerated.");
        router.refresh();
      } else {
        toast.error(res.message ?? "Regeneration failed.");
      }
    });

  const onExport = (format: ExportFormat) =>
    startBusy(async () => {
      try {
        const file = await exportDraftAction(draft.id, format);
        const blob = new Blob([file.content], { type: file.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatus("exported");
        toast.success(`Exported ${file.filename}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed.");
      }
    });

  const onDelete = () =>
    startBusy(async () => {
      await deleteDraft(draft.id);
      toast.success("Draft deleted.");
      router.push("/app/content");
    });

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={!dirty || saving} size="sm" className="gap-2">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
        </Button>

        {/* Regenerate whole draft (confirm — overwrites) */}
        <Dialog>
          <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")} disabled={busy}>
            <RefreshCw className="size-4" /> Regenerate
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Regenerate this draft?</DialogTitle>
              <DialogDescription>
                This overwrites the current article, FAQ, and schema with a freshly generated draft from the
                source opportunity. Unsaved edits will be lost.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </DialogClose>
              <DialogClose className={cn(buttonVariants())} onClick={onRegenerateDraft}>
                Regenerate
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Export (confirm → choose format) */}
        <Dialog>
          <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")} disabled={busy}>
            <Download className="size-4" /> Export
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Export draft</DialogTitle>
              <DialogDescription>
                Download this draft. Nothing is published — export is the only output path. Save your edits
                first so they&apos;re included.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2">
              {(["md", "html", "jsonld"] as ExportFormat[]).map((f) => (
                <DialogClose key={f} className={cn(buttonVariants({ variant: "outline" }), "uppercase")} onClick={() => onExport(f)}>
                  {f === "jsonld" ? "JSON-LD" : f}
                </DialogClose>
              ))}
            </div>
            <button
              disabled
              title="Coming later — behind a separate confirm"
              className="mt-1 w-full cursor-not-allowed rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground opacity-70"
            >
              Push to CMS (coming soon)
            </button>
          </DialogContent>
        </Dialog>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="font-normal capitalize">{draft.kind}</Badge>
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-xs capitalize text-muted-foreground">{status}</span>
          {dirty && <span className="text-xs text-primary">Unsaved changes</span>}
        </div>
      </div>

      {draft.source === "scaffold" && (
        <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          This is a keyless <strong>scaffold</strong> — it contains no invented facts. Add an OpenAI/Anthropic
          key in Settings for full generation, or fill it in yourself.
        </p>
      )}

      {/* Title */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium">Title</label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      {/* Article */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Article</label>
          <div className="flex gap-1 text-xs">
            <button onClick={() => setTab("edit")} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", tab === "edit" ? "bg-secondary text-foreground" : "text-muted-foreground")}>
              <Code className="size-3.5" /> Markdown
            </button>
            <button onClick={() => setTab("preview")} className={cn("inline-flex items-center gap-1 rounded px-2 py-1", tab === "preview" ? "bg-secondary text-foreground" : "text-muted-foreground")}>
              <Eye className="size-3.5" /> Preview
            </button>
          </div>
        </div>
        {tab === "edit" ? (
          <Textarea value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} rows={18} className="font-mono text-xs" />
        ) : (
          <div
            className="prose-limelight min-h-[20rem] rounded-lg border border-border bg-card px-4 py-3 text-sm [&_a]:text-primary [&_a]:underline [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-medium [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_ul]:my-2"
            dangerouslySetInnerHTML={{ __html: mdPreview(bodyMd) }}
          />
        )}
      </div>

      {/* FAQ editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">FAQ <span className="text-muted-foreground">(questions are your weak audit prompts)</span></label>
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setFaq((f) => [...f, { question: "", answer: "" }])}>
            <Plus className="size-3.5" /> Add
          </Button>
        </div>
        {faq.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">No FAQ items.</p>
        ) : (
          <ul className="space-y-2">
            {faq.map((item, i) => (
              <li key={i} className="space-y-2 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <Input
                    value={item.question}
                    placeholder="Question"
                    onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => setFaq((f) => f.filter((_, j) => j !== i))} aria-label="Remove">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Textarea
                  value={item.answer}
                  placeholder="Answer"
                  rows={2}
                  onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* JSON-LD panel */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">JSON-LD schema</label>
          <div className="flex items-center gap-2">
            {valid.valid ? (
              <span className="inline-flex items-center gap-1 text-xs text-positive"><CheckCircle2 className="size-4" /> Valid</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-negative"><AlertCircle className="size-4" /> {valid.errors.length} issue{valid.errors.length === 1 ? "" : "s"}</span>
            )}
            <Button variant="outline" size="sm" className="gap-1" onClick={onRegenerateSchema} disabled={busy}>
              <RefreshCw className="size-3.5" /> Regenerate schema
            </Button>
          </div>
        </div>
        {!valid.valid && (
          <ul className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {valid.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
        <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-card px-3 py-2 text-xs">
          {JSON.stringify(jsonLd, null, 2)}
        </pre>
        <p className="text-xs text-muted-foreground">
          Schema is rebuilt from your title + FAQ on save and on regenerate — it stays valid and in sync.
        </p>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <Dialog>
          <DialogTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2 text-destructive")} disabled={busy}>
            <Trash2 className="size-4" /> Delete draft
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this draft?</DialogTitle>
              <DialogDescription>This permanently removes the draft. This can&apos;t be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</DialogClose>
              <DialogClose className={cn(buttonVariants({ variant: "destructive" }))} onClick={onDelete}>Delete</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
