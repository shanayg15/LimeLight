import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuditState } from "@/lib/actions/audits";
import { AuditRunControl } from "@/components/audit/audit-run-control";

export const metadata: Metadata = { title: "Overview" };

const TYPE_LABEL: Record<string, string> = {
  person: "Person",
  business: "Business",
  product: "Product",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function OverviewPage() {
  const state = await getAuditState();
  if (!state) redirect("/onboarding");

  const run = state.run;
  const complete = run?.status === "complete" && run.scores;
  const scores = complete ? run.scores! : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{state.subjectName}</h1>
            <Badge variant="secondary">{TYPE_LABEL[state.subjectType] ?? state.subjectType}</Badge>
          </div>
          <p className="max-w-prose text-muted-foreground">
            {state.subjectDescription || "See how AI assistants talk about you, on truthful data."}
          </p>
        </div>
        <Link href="/app/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Edit subject
        </Link>
      </header>

      {scores ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreCard
              label="Visibility"
              value={pct(scores.visibilityScore)}
              hint="% of prompt responses that mention you"
            />
            <ScoreCard
              label="Share of voice"
              value={scores.shareOfVoice == null ? "—" : pct(scores.shareOfVoice)}
              hint={
                scores.shareOfVoice == null
                  ? "Add competitors to compute SoV"
                  : "you ÷ (you + competitors)"
              }
            />
            <ScoreCard
              label="Avg. position"
              value={scores.avgPosition == null ? "—" : scores.avgPosition.toFixed(1)}
              hint="mean rank when you're named"
            />
            <ScoreCard
              label="Citation freq."
              value={pct(scores.citationFrequency)}
              hint="prompts citing your own site"
            />
          </div>

          {scores.perEngine && scores.perEngine.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">By engine:</span>
              {scores.perEngine.map((e) => (
                <span
                  key={e.engine}
                  className="rounded-md border border-border px-3 py-1.5 text-sm capitalize"
                >
                  {e.engine}{" "}
                  <span className="font-medium not-italic">{pct(e.visibilityScore)}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    ({e.promptsMentioned}/{e.promptCount})
                  </span>
                </span>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base">Audit complete</CardTitle>
                <CardDescription>
                  {run?.finishedAt
                    ? `Last run ${new Date(run.finishedAt).toLocaleString()}`
                    : "Latest run"}
                  {" · "}
                  mentioned in {scores.promptsMentionedCount} of {scores.promptCount} prompts
                </CardDescription>
              </div>
              <Link href="/app/visibility" className={buttonVariants({ size: "sm" })}>
                See where AI mentions you
              </Link>
            </CardHeader>
            <CardContent>
              <AuditRunControl state={state} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {run && (run.status === "queued" || run.status === "running")
                ? "Audit in progress"
                : "Run your first audit"}
            </CardTitle>
            <CardDescription>
              Fan your {state.enabledCount} enabled prompt{state.enabledCount === 1 ? "" : "s"} across
              a real, search-enabled engine and capture genuine mentions + cited sources — never
              fabricated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AuditRunControl state={state} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
    </Card>
  );
}
