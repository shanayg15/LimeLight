/** Spotlight/amber arc gauge for the 0–100 AI-readiness score. */
export function ReadinessGauge({ score, readable }: { score: number; readable: boolean }) {
  const r = 52;
  const circ = Math.PI * r; // half-circle arc length
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const dash = circ * pct;

  const tone =
    score >= 70 ? "var(--positive)" : score >= 40 ? "var(--primary)" : "var(--negative)";
  const label = score >= 70 ? "Strong" : score >= 40 ? "Needs work" : "Weak";

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 140 80" className="w-44" role="img" aria-label={`AI-readiness score ${score} of 100`}>
        <path
          d="M 18 70 A 52 52 0 0 1 122 70"
          fill="none"
          stroke="var(--secondary)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <path
          d="M 18 70 A 52 52 0 0 1 122 70"
          fill="none"
          stroke={tone}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
        />
        <text x="70" y="58" textAnchor="middle" className="fill-foreground" fontSize="26" fontWeight="600">
          {score}
        </text>
        <text x="70" y="72" textAnchor="middle" className="fill-muted-foreground" fontSize="9">
          / 100
        </text>
      </svg>
      <div className="-mt-1 text-sm font-medium" style={{ color: tone }}>
        {readable ? label : "Unreadable"}
      </div>
    </div>
  );
}
