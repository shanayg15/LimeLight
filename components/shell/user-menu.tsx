"use client";

import { LogOut } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/actions/auth";

export function UserMenu({ email }: { email: string }) {
  const initial = email.trim()[0]?.toUpperCase() ?? "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "gap-2")}
      >
        <span className="grid size-6 place-items-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate sm:inline">{email}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-foreground">{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <DropdownMenuItem
            render={<button type="submit" />}
            className="w-full cursor-pointer"
          >
            <LogOut className="size-4" />
            Log out
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
