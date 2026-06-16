"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { EngineId } from "@/lib/db/schema";
import { saveAuditSettings } from "@/lib/actions/settings";

const ENGINE_LABEL: Record<EngineId, string> = {
  perplexity: "Perplexity",
  openai: "ChatGPT (OpenAI)",
  gemini: "Gemini",
  claude: "Claude",
};

export function AuditSettings({
  initial,
  allEngines,
  enginesWithKey,
}: {
  initial: {
    enabledEngines: EngineId[];
    samples: number;
    temperature: number;
    maxSpendPerRunUsd: number | null;
    maxSpendMonthlyUsd: number | null;
  };
  allEngines: EngineId[];
  enginesWithKey: EngineId[];
}) {
  const router = useRouter();
  const [engines, setEngines] = useState<EngineId[]>(initial.enabledEngines);
  const [samples, setSamples] = useState(String(initial.samples));
  const [temperature, setTemperature] = useState(String(initial.temperature));
  const [perRun, setPerRun] = useState(initial.maxSpendPerRunUsd?.toString() ?? "");
  const [monthly, setMonthly] = useState(initial.maxSpendMonthlyUsd?.toString() ?? "");
  const [pending, start] = useTransition();

  const toggle = (e: EngineId) =>
    setEngines((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e]));

  const save = () => {
    if (engines.length === 0) {
      toast.error("Enable at least one engine");
      return;
    }
    const s = Number(samples);
    const t = Number(temperature);
    if (!Number.isInteger(s) || s < 1 || s > 10) {
      toast.error("Samples must be 1–10");
      return;
    }
    if (Number.isNaN(t) || t < 0 || t > 1) {
      toast.error("Temperature must be 0–1");
      return;
    }
    start(async () => {
      try {
        await saveAuditSettings({
          enabledEngines: engines,
          samples: s,
          temperature: t,
          maxSpendPerRunUsd: perRun.trim() === "" ? null : Number(perRun),
          maxSpendMonthlyUsd: monthly.trim() === "" ? null : Number(monthly),
        });
        toast.success("Audit settings saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't save");
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Engines</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {allEngines.map((e) => {
            const on = engines.includes(e);
            const hasKey = enginesWithKey.includes(e);
            return (
              <button
                key={e}
                type="button"
                onClick={() => toggle(e)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                  on ? "border-primary bg-primary/10" : "border-border hover:bg-accent/50",
                )}
              >
                <span>{ENGINE_LABEL[e]}</span>
                <span className="text-xs text-muted-foreground">
                  {on ? "on" : "off"}
                  {!hasKey && " · no key"}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Engines without a key are skipped at run time (their results never appear).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="samples">Samples per prompt</Label>
          <Input
            id="samples"
            type="number"
            min={1}
            max={10}
            value={samples}
            onChange={(e) => setSamples(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">More samples = steadier signal, more cost.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="temp">Temperature</Label>
          <Input
            id="temp"
            type="number"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Low = more deterministic answers.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="perrun">Max spend per run ($)</Label>
          <Input
            id="perrun"
            type="number"
            min={0}
            step={0.5}
            value={perRun}
            onChange={(e) => setPerRun(e.target.value)}
            placeholder="no cap"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="monthly">Max spend per month ($)</Label>
          <Input
            id="monthly"
            type="number"
            min={0}
            step={1}
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            placeholder="no cap"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={pending}>
          Save audit settings
        </Button>
      </div>
    </div>
  );
}
