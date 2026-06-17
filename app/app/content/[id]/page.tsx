import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getDraft } from "@/lib/actions/content";
import { ContentEditor } from "@/components/content/content-editor";

export const metadata: Metadata = { title: "Edit draft" };

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDraft(id);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/app/content" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> All drafts
      </Link>
      <ContentEditor draft={data.draft} validation={data.validation} />
    </div>
  );
}
