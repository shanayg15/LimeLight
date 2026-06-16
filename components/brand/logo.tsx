import { cn } from "@/lib/utils";

/** A small spotlight mark — a beam lighting the subject (the "limelight"). */
function SpotlightMark({ className }: { className?: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <radialGradient id="ll-glow" cx="50%" cy="32%" r="70%">
          <stop offset="0%" stopColor="oklch(0.88 0.16 82)" />
          <stop offset="100%" stopColor="oklch(0.6 0.16 68)" />
        </radialGradient>
      </defs>
      {/* beam */}
      <path d="M12 3 L20 20 H4 Z" fill="url(#ll-glow)" opacity="0.22" />
      {/* light source */}
      <circle cx="12" cy="8" r="3.1" fill="url(#ll-glow)" />
    </svg>
  );
}

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight",
        className,
      )}
    >
      <SpotlightMark />
      {showWordmark && (
        <span className="text-lg">
          Lime<span className="text-primary">light</span>
        </span>
      )}
    </span>
  );
}
