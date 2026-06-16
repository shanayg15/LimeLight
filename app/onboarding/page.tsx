import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { Logo } from "@/components/brand/logo";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";

export const metadata: Metadata = { title: "Get started" };

// /onboarding is also the "add a subject" flow (reached from the switcher), so
// it does not redirect away when subjects already exist.
export default async function OnboardingPage() {
  await requireUser();

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto mb-10 flex max-w-2xl items-center justify-between">
        <Link href="/app" aria-label="Limelight">
          <Logo />
        </Link>
        <span className="text-sm text-muted-foreground">Set up your subject</span>
      </div>
      <OnboardingFlow />
    </div>
  );
}
