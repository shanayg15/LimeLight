"use client";

import { useState, useTransition } from "react";
import { Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Prompt, PromptIntent } from "@/lib/db/schema";
import {
  deletePrompt,
  togglePrompt,
  upsertPrompt,
} from "@/lib/actions/subjects";

const INTENTS: PromptIntent[] = ["discovery", "comparison", "reputation", "how_to"];
const INTENT_LABEL: Record<string, string> = {
  discovery: "discovery",
  comparison: "comparison",
  reputation: "reputation",
  how_to: "how-to",
};

function IntentSelect({
  value,
  onChange,
}: {
  value: PromptIntent;
  onChange: (v: PromptIntent) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as PromptIntent)}
      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
      aria-label="Intent"
    >
      {INTENTS.map((i) => (
        <option key={i} value={i}>
          {INTENT_LABEL[i]}
        </option>
      ))}
    </select>
  );
}

export function PromptManager({
  subjectId,
  initialPrompts,
}: {
  subjectId: string;
  initialPrompts: Prompt[];
}) {
  const [items, setItems] = useState<Prompt[]>(initialPrompts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [newText, setNewText] = useState("");
  const [newIntent, setNewIntent] = useState<PromptIntent>("discovery");
  const [, startTransition] = useTransition();

  const enabledCount = items.filter((p) => p.enabled).length;

  const onToggle = (p: Prompt) => {
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)));
    startTransition(async () => {
      try {
        await togglePrompt(p.id, !p.enabled);
      } catch {
        setItems(prev);
        toast.error("Couldn't update that prompt");
      }
    });
  };

  const onDelete = (p: Prompt) => {
    const prev = items;
    setItems((xs) => xs.filter((x) => x.id !== p.id));
    startTransition(async () => {
      try {
        await deletePrompt(p.id);
      } catch {
        setItems(prev);
        toast.error("Couldn't delete that prompt");
      }
    });
  };

  const saveEdit = (p: Prompt) => {
    const text = editText.trim();
    if (text.length < 3) return;
    const prev = items;
    setItems((xs) =>
      xs.map((x) => (x.id === p.id ? { ...x, text, edited: x.source === "generated" ? true : x.edited } : x)),
    );
    setEditingId(null);
    // Omit intent so the server preserves the existing one.
    startTransition(async () => {
      try {
        await upsertPrompt(subjectId, { text }, p.id);
      } catch {
        setItems(prev);
        toast.error("Couldn't save that prompt");
      }
    });
  };

  const addPrompt = () => {
    const text = newText.trim();
    if (text.length < 3) return;
    startTransition(async () => {
      try {
        const { id } = await upsertPrompt(subjectId, { text, intent: newIntent });
        setItems((xs) => [
          {
            id,
            subjectId,
            text,
            source: "manual",
            topic: null,
            intent: newIntent,
            enabled: true,
            edited: false,
            createdAt: new Date(),
          },
          ...xs,
        ]);
        setNewText("");
      } catch {
        toast.error("Couldn't add that prompt");
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {items.length} prompt{items.length === 1 ? "" : "s"} · {enabledCount} tracked
        </span>
      </div>

      {/* Add a prompt */}
      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPrompt();
            }
          }}
          placeholder="Add your own prompt…"
        />
        <IntentSelect value={newIntent} onChange={setNewIntent} />
        <Button type="button" onClick={addPrompt} disabled={newText.trim().length < 3}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No prompts yet. Generate a set or add your own above.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map((p) => (
            <li
              key={p.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                !p.enabled && "opacity-55",
              )}
            >
              {editingId === p.id ? (
                <>
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit(p);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                  />
                  <Button type="button" size="icon-sm" onClick={() => saveEdit(p)} aria-label="Save">
                    <Check className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel"
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.text}</span>
                  {p.intent ? (
                    <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                      {INTENT_LABEL[p.intent] ?? p.intent}
                    </Badge>
                  ) : null}
                  {p.source === "manual" ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                      yours
                    </Badge>
                  ) : null}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onToggle(p)}
                    aria-label={p.enabled ? "Pause (exclude from audits)" : "Track (include in audits)"}
                  >
                    {p.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(p.id);
                      setEditText(p.text);
                    }}
                    aria-label="Edit"
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onDelete(p)}
                    aria-label="Delete"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
