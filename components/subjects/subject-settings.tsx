"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { ChipsInput } from "@/components/subjects/chips-input";
import { PromptManager } from "@/components/subjects/prompt-manager";
import { generatePrompts, saveSubjectSettings } from "@/lib/actions/subjects";

const TYPES: { value: SubjectType; label: string }[] = [
  { value: "person", label: "Person" },
  { value: "business", label: "Business" },
  { value: "product", label: "Product" },
];

export function SubjectSettings({
  subjectId,
  initial,
  initialCompetitors,
  initialPrompts,
  hasModelKey,
}: {
  subjectId: string;
  initial: {
    name: string;
    type: SubjectType;
    aliases: string[];
    siteUrl: string;
    description: string;
    brandVoice: string;
    topics: string[];
  };
  initialCompetitors: string[];
  initialPrompts: Prompt[];
  hasModelKey: boolean;
}) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [regenerating, startRegen] = useTransition();

  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<SubjectType>(initial.type);
  const [aliases, setAliases] = useState<string[]>(initial.aliases);
  const [siteUrl, setSiteUrl] = useState(initial.siteUrl);
  const [description, setDescription] = useState(initial.description);
  const [brandVoice, setBrandVoice] = useState(initial.brandVoice);
  const [topics, setTopics] = useState<string[]>(initial.topics);
  const [competitorNames, setCompetitorNames] = useState<string[]>(initialCompetitors);

  const save = () => {
    startSaving(async () => {
      try {
        await saveSubjectSettings(
          subjectId,
          { name, type, aliases, siteUrl, description, brandVoice, topics },
          competitorNames,
        );
        toast.success("Subject saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  };

  const regenerate = () => {
    startRegen(async () => {
      try {
        const res = await generatePrompts(subjectId);
        toast.success(
          res.source === "template"
            ? `Regenerated ${res.count} prompts (template — no model key)`
            : `Regenerated ${res.count} prompts`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not regenerate");
      }
    });
  };

  const promptsKey = initialPrompts.map((p) => p.id).join(",");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subject</CardTitle>
          <CardDescription>Who or what Limelight audits AI answers for.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-name">Name</Label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <div className="flex gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                      type === t.value
                        ? "border-primary bg-primary/10"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-site">Website</Label>
            <Input
              id="s-site"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="example.com"
            />
          </div>
          <div className="space-y-2">
            <Label>Aliases / handles</Label>
            <ChipsInput value={aliases} onChange={setAliases} placeholder="Add and press Enter" max={20} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-desc">One-line description</Label>
            <Textarea
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-voice">Brand voice (used when generating content later)</Label>
            <Textarea
              id="s-voice"
              value={brandVoice}
              onChange={(e) => setBrandVoice(e.target.value)}
              rows={2}
              placeholder="Tone notes — e.g. plain-spoken, technical, warm."
            />
          </div>
          <div className="space-y-2">
            <Label>Topics</Label>
            <ChipsInput value={topics} onChange={setTopics} placeholder="Add and press Enter" max={12} />
          </div>
          <div className="space-y-2">
            <Label>Competitors (power share of voice)</Label>
            <ChipsInput
              value={competitorNames}
              onChange={setCompetitorNames}
              placeholder="Add and press Enter"
              max={20}
            />
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={save} disabled={saving || name.trim().length === 0 || topics.length === 0}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Prompt set</CardTitle>
            <CardDescription>The questions audited against. Edit, toggle, or add your own.</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
              disabled={regenerating}
            >
              <RefreshCw className={cn("size-3.5", regenerating && "animate-spin")} />
              Regenerate
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Regenerate prompt set?</DialogTitle>
                <DialogDescription>
                  This replaces generated prompts you haven&apos;t edited. Your own added prompts and
                  any edits are kept.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </DialogClose>
                <DialogClose className={cn(buttonVariants())} onClick={regenerate}>
                  Regenerate
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasModelKey && (
            <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              No generation model key set — prompts are template-based. Add an API key (M4 settings)
              for AI-tailored prompts.
            </p>
          )}
          <PromptManager key={promptsKey} subjectId={subjectId} initialPrompts={initialPrompts} />
        </CardContent>
      </Card>
    </div>
  );
}
