import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getAssistantSubject } from "@/lib/actions/assistant";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata: Metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const subject = await getAssistantSubject();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Assistant</h1>
        <p className="text-muted-foreground">
          A chat over your own Limelight data — grounded in your audits, sources, and actions. It cites
          what it used and never invents facts. It can&apos;t take actions; it routes you to the
          confirm-gated screens.
        </p>
      </header>

      {!subject ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
          Set up a subject first.{" "}
          <Link href="/onboarding" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Start onboarding
          </Link>
        </div>
      ) : (
        <AssistantChat subjectName={subject.name} />
      )}
    </div>
  );
}
