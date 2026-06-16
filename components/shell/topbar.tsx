import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SubjectSwitcher } from "@/components/subjects/subject-switcher";
import { UserMenu } from "./user-menu";

export function Topbar({
  email,
  subjects,
}: {
  email: string;
  subjects: { id: string; name: string; isActive: boolean }[];
}) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background/60 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/app" className="shrink-0 md:hidden" aria-label="Limelight overview">
          <Logo showWordmark={false} />
        </Link>
        <SubjectSwitcher subjects={subjects} />
      </div>
      <UserMenu email={email} />
    </header>
  );
}
