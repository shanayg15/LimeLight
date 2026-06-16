"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setActiveSubject } from "@/lib/actions/subjects";

type SwitcherSubject = { id: string; name: string; isActive: boolean };

export function SubjectSwitcher({ subjects }: { subjects: SwitcherSubject[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (subjects.length === 0) {
    return (
      <button
        type="button"
        onClick={() => router.push("/onboarding")}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2")}
      >
        <Plus className="size-4" />
        Set up subject
      </button>
    );
  }

  const active = subjects.find((s) => s.isActive) ?? subjects[0];

  const select = (id: string) => {
    if (id === active.id) return;
    startTransition(async () => {
      await setActiveSubject(id);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-w-[220px] gap-2")}
        disabled={pending}
      >
        <span className="truncate">{active.name}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-muted-foreground">Active subject</DropdownMenuLabel>
        {subjects.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => select(s.id)} className="cursor-pointer">
            <span className="truncate">{s.name}</span>
            {s.id === active.id && <Check className="ml-auto size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/onboarding")} className="cursor-pointer">
          <Plus className="size-4" />
          New subject
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
