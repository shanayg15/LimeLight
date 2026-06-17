import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" aria-label="Limelight home">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link href="/pricing" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Pricing
          </Link>
          <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants({ size: "sm" })}>
            Get started
          </Link>
        </nav>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6">
          <span>Limelight · open-source AI-visibility auditor · MIT</span>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <a href="https://github.com/shanayg15/LimeLight" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
