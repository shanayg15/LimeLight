import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * Marketing surface is LIGHT (warm off-white + amber gradient accents) — a
 * look-alike of a clean AEO marketing site, with our own brand + 100% original
 * copy. The app stays on the dark token theme; these pages use explicit light
 * colors so the root `.dark` class doesn't affect them.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link href="/" aria-label="Limelight home" className="text-zinc-900">
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 text-sm sm:gap-2">
            <Link href="/pricing" className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:text-zinc-900">
              Pricing
            </Link>
            <a
              href="https://github.com/shanayg15/LimeLight"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:text-zinc-900 sm:inline"
            >
              GitHub
            </a>
            <Link href="/login" className="rounded-md px-3 py-1.5 text-zinc-600 transition-colors hover:text-zinc-900">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-orange-600 px-3.5 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-orange-700"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="border-t border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-10 sm:flex-row">
          <div className="flex items-center gap-2 text-zinc-900">
            <Logo />
          </div>
          <p className="text-sm text-zinc-500">
            Open-source AI-visibility auditor · MIT licensed · bring your own keys
          </p>
          <div className="flex items-center gap-4 text-sm text-zinc-600">
            <Link href="/pricing" className="hover:text-zinc-900">Pricing</Link>
            <Link href="/login" className="hover:text-zinc-900">Log in</Link>
            <a href="https://github.com/shanayg15/LimeLight" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
