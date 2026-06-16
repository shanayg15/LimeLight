"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KeyProvider } from "@/lib/db/schema";
import {
  deleteProviderKey,
  saveProviderKey,
  testProviderKey,
  type ProviderKeyStatus,
} from "@/lib/actions/settings";

const LABEL: Record<KeyProvider, string> = {
  perplexity: "Perplexity",
  openai: "OpenAI",
  gemini: "Google Gemini",
  anthropic: "Anthropic (Claude)",
};
const HINT: Record<KeyProvider, string> = {
  perplexity: "Answer engine — native citations",
  openai: "Answer engine (ChatGPT) + generation",
  gemini: "Answer engine — Google Search grounding",
  anthropic: "Answer engine (Claude) + default generation & detection",
};

function KeyRow({ status }: { status: ProviderKeyStatus }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, start] = useTransition();
  const [testing, setTesting] = useState(false);

  const save = () =>
    start(async () => {
      try {
        await saveProviderKey(status.provider, value);
        toast.success(`${LABEL[status.provider]} key saved`);
        setValue("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      }
    });

  const remove = () =>
    start(async () => {
      await deleteProviderKey(status.provider);
      toast.success(`${LABEL[status.provider]} key removed`);
      router.refresh();
    });

  const test = async () => {
    setTesting(true);
    const r = await testProviderKey(status.provider, value);
    setTesting(false);
    if (r.ok) toast.success(r.message);
    else toast.error(r.message);
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">{LABEL[status.provider]}</div>
          <div className="text-xs text-muted-foreground">{HINT[status.provider]}</div>
        </div>
        <div className="text-xs">
          {status.hasUserKey ? (
            <span className="text-positive">Key set {status.masked}</span>
          ) : status.hasEnvFallback ? (
            <span className="text-muted-foreground">Using env fallback</span>
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={status.hasUserKey ? "Replace key…" : "Paste API key…"}
          className="min-w-[180px] flex-1"
        />
        <Button type="button" variant="outline" onClick={test} disabled={testing || !value.trim()}>
          {testing ? "Testing…" : "Test"}
        </Button>
        <Button type="button" onClick={save} disabled={pending || value.trim().length < 8}>
          Save
        </Button>
        {status.hasUserKey && (
          <Button type="button" variant="ghost" onClick={remove} disabled={pending}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProviderKeys({ keys }: { keys: ProviderKeyStatus[] }) {
  return (
    <div className="space-y-3">
      {keys.map((k) => (
        <KeyRow key={k.provider} status={k} />
      ))}
      <p className="text-xs text-muted-foreground">
        Keys are encrypted at rest (AES-256-GCM) and never sent back to your browser. A per-user key
        overrides the server&apos;s env fallback.
      </p>
    </div>
  );
}
