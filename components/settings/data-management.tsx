"use client";

import { useState, useTransition } from "react";
import { Download, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { deleteAccount, deleteAllData, exportMyData } from "@/lib/actions/account";

export function DataManagement() {
  const [busy, start] = useTransition();
  const [confirmText, setConfirmText] = useState("");

  const onExport = () =>
    start(async () => {
      try {
        const data = await exportMyData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `limelight-export-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success("Exported your data.");
      } catch {
        toast.error("Export failed.");
      }
    });

  const onDeleteData = () =>
    start(async () => {
      try {
        const { deletedSubjects } = await deleteAllData();
        toast.success(`Deleted ${deletedSubjects} subject${deletedSubjects === 1 ? "" : "s"} and all their data.`);
        window.location.href = "/app";
      } catch {
        toast.error("Delete failed.");
      }
    });

  const onDeleteAccount = () =>
    start(async () => {
      try {
        await deleteAccount();
        // deleteAccount signs out + redirects; this is a fallback.
        window.location.href = "/";
      } catch {
        toast.error("Account deletion failed.");
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="text-sm">
          <p className="font-medium">Export your data</p>
          <p className="text-muted-foreground">Download your subjects, prompts, runs, drafts, and schedules as JSON. (Your encrypted keys are never included.)</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-2" onClick={onExport} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Export
        </Button>
      </div>

      {/* Danger zone */}
      <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <AlertTriangle className="size-4" /> Danger zone
        </h3>

        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">Delete all subjects and their audit data. Keeps your account and keys.</p>
          <Dialog>
            <DialogTrigger className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0")} disabled={busy}>
              Delete data
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete all your data?</DialogTitle>
                <DialogDescription>
                  This permanently deletes every subject, prompt, audit run, draft, site audit, and schedule.
                  Your account and API keys stay. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</DialogClose>
                <DialogClose className={cn(buttonVariants({ variant: "destructive" }))} onClick={onDeleteData}>
                  Delete all data
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-destructive/20 pt-3">
          <p className="text-sm text-muted-foreground">Permanently delete your account, all data, and stored keys, then sign out.</p>
          <Dialog>
            <DialogTrigger className={cn(buttonVariants({ variant: "destructive", size: "sm" }), "shrink-0 gap-1.5")} disabled={busy}>
              <Trash2 className="size-4" /> Delete account
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete your account?</DialogTitle>
                <DialogDescription>
                  This permanently deletes your account, every subject and audit, and your encrypted API keys.
                  Type <strong>DELETE</strong> to confirm. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
              <DialogFooter>
                <DialogClose className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</DialogClose>
                <DialogClose
                  className={cn(buttonVariants({ variant: "destructive" }), confirmText !== "DELETE" && "pointer-events-none opacity-50")}
                  onClick={() => confirmText === "DELETE" && onDeleteAccount()}
                >
                  Delete account
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
