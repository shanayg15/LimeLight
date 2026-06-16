"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ChipsInput({
  value,
  onChange,
  placeholder,
  max,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value];
    for (const part of parts) {
      const exists = next.some((v) => v.toLowerCase() === part.toLowerCase());
      if (!exists && (max === undefined || next.length < max)) next.push(part);
    }
    onChange(next);
    setDraft("");
  };

  const atMax = max !== undefined && value.length >= max;

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {value.map((chip) => (
            <span
              key={chip}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm text-secondary-foreground"
            >
              {chip}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== chip))}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Remove ${chip}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) add(draft);
        }}
        placeholder={atMax ? "Limit reached" : placeholder}
        disabled={atMax}
      />
    </div>
  );
}
