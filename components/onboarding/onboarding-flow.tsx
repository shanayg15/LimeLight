"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Prompt, SubjectType } from "@/lib/db/schema";
import { saveOnboarding } from "@/lib/actions/subjects";
import { ChipsInput } from "@/components/subjects/chips-input";
import { PromptManager } from "@/components/subjects/prompt-manager";

const TYPES: { value: SubjectType; label: string; hint: string }[] = [
  { value: "person", label: "Person", hint: "creator, founder, professional" },
  { value: "business", label: "Business", hint: "solo or small business" },
  { value: "product", label: "Product", hint: "app, tool, or service" },
];

const STEPS = ["Identity", "Topics", "Competitors", "Prompts"];

export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<SubjectType>("person");
  const [aliases, setAliases] = useState<string[]>([]);
  const [siteUrl, setSiteUrl] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [competitorNames, setCompetitorNames] = useState<string[]>([]);

  // Generated state
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [source, setSource] = useState<"model" | "template" | null>(null);
  const [version, setVersion] = useState(0);

  const canNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && topics.length > 0) ||
    step === 2 ||
    step === 3;

  const runGenerate = () => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveOnboarding({
          subjectId,
          input: { name, type, aliases, siteUrl, description, topics },
          competitorNames,
        });
        setSubjectId(res.subjectId);
        setPrompts(res.prompts);
        setSource(res.source);
        setVersion((v) => v + 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not generate prompts. Try again.");
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Progress */}
      <ol className="mb-8 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full border text-[11px]",
                i <= step
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border text-muted-foreground",
              )}
            >
              {i + 1}
            </span>
            <span className={cn(i === step ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-border bg-card p-6">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Who or what are we tracking?</h2>
              <p className="text-sm text-muted-foreground">
                This is the subject AI assistants will be asked about.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ada Lovelace, Acme Studio, Mailwise"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      type === t.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.hint}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Aliases / handles (optional)</Label>
              <ChipsInput
                value={aliases}
                onChange={setAliases}
                placeholder="Other names you go by — helps disambiguate"
                max={20}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="site">Website (optional)</Label>
              <Input
                id="site"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="desc">One-line description (optional)</Label>
              <Textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What you're known for — used to disambiguate and ground prompts."
                rows={2}
              />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">What do you want to be found for?</h2>
              <p className="text-sm text-muted-foreground">
                Add 3–8 topics you want to show up for in AI answers.
              </p>
            </div>
            <ChipsInput
              value={topics}
              onChange={setTopics}
              placeholder="Type a topic and press Enter"
              max={12}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">People or products like you (optional)</h2>
              <p className="text-sm text-muted-foreground">
                These power your <span className="text-foreground">share of voice</span> — how often
                AI mentions you vs. them.
              </p>
            </div>
            <ChipsInput
              value={competitorNames}
              onChange={setCompetitorNames}
              placeholder="Add a competitor and press Enter"
              max={20}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Your prompt set</h2>
              <p className="text-sm text-muted-foreground">
                The questions real people ask AI that could surface you. Edit, remove, toggle, or add
                your own — you can always change these later.
              </p>
            </div>

            {prompts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
                {pending ? (
                  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Generating your prompt set…
                  </p>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-muted-foreground">
                      We&apos;ll draft a curated set from your subject and topics.
                    </p>
                    <Button type="button" onClick={runGenerate}>
                      <Sparkles className="size-4" />
                      Generate my prompt set
                    </Button>
                    {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {source === "template" && (
                  <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
                    Generated from a template (no model key set). Add an API key in Settings for
                    AI-tailored prompts.
                  </p>
                )}
                {subjectId && (
                  <PromptManager key={version} subjectId={subjectId} initialPrompts={prompts} />
                )}
                <div className="flex justify-end">
                  <Dialog>
                    <DialogTrigger
                      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
                      disabled={pending}
                    >
                      <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
                      Regenerate
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Regenerate prompt set?</DialogTitle>
                        <DialogDescription>
                          This replaces the generated prompts you haven&apos;t edited. Your own added
                          prompts and any edits are kept.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter>
                        <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                          Cancel
                        </DialogClose>
                        <DialogClose className={cn(buttonVariants())} onClick={runGenerate}>
                          Regenerate
                        </DialogClose>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Nav */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {step < 3 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
            Next
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => router.push("/app")}
            disabled={prompts.length === 0 || pending}
          >
            Finish & go to dashboard
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
