import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveSubject } from "@/lib/actions/subjects";
import { getSettingsState } from "@/lib/actions/settings";
import { engineKeyProvider } from "@/lib/core/keys";
import type { EngineId } from "@/lib/db/schema";
import { SubjectSettings } from "@/components/subjects/subject-settings";
import { ProviderKeys } from "@/components/settings/provider-keys";
import { AuditSettings } from "@/components/settings/audit-settings";
import { DataManagement } from "@/components/settings/data-management";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [data, settings] = await Promise.all([getActiveSubject(), getSettingsState()]);

  const keyByProvider = new Map(settings.keys.map((k) => [k.provider, k]));
  const enginesWithKey = settings.allEngines.filter((e) => {
    const k = keyByProvider.get(engineKeyProvider(e));
    return Boolean(k && (k.hasUserKey || k.hasEnvFallback));
  }) as EngineId[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Subject and prompt set, bring-your-own model keys, and audit controls.
        </p>
      </header>

      {data ? (
        <SubjectSettings
          subjectId={data.subject.id}
          initial={{
            name: data.subject.name,
            type: data.subject.type as "person" | "business" | "product",
            aliases: data.subject.aliases,
            siteUrl: data.subject.siteUrl ?? "",
            description: data.subject.description ?? "",
            brandVoice: data.subject.brandVoice ?? "",
            topics: data.subject.topics,
          }}
          initialCompetitors={data.competitors.map((c) => c.name)}
          initialPrompts={data.prompts}
          hasModelKey={enginesWithKey.length > 0 || settings.keys.some((k) => k.hasUserKey)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No subject yet</CardTitle>
            <CardDescription>Set up a subject to manage its prompt set.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={buttonVariants({ size: "sm" })}>
              Set up your subject
            </Link>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Model providers (bring your own keys)</CardTitle>
          <CardDescription>
            Per-user keys, encrypted at rest. You pay your own provider costs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProviderKeys keys={settings.keys} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engines &amp; cost controls</CardTitle>
          <CardDescription>
            Which engines to audit, how many samples, and hard spend caps (enforced before and during
            a run).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditSettings
            initial={{
              enabledEngines: settings.enabledEngines,
              samples: settings.samples,
              temperature: settings.temperature,
              maxSpendPerRunUsd: settings.maxSpendPerRunUsd,
              maxSpendMonthlyUsd: settings.maxSpendMonthlyUsd,
            }}
            allEngines={settings.allEngines}
            enginesWithKey={enginesWithKey}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled tracking</CardTitle>
          <CardDescription>
            Re-run audits on a schedule and opt in to a weekly digest — configured per subject on the
            Tracking page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app/tracking" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage tracking &amp; digest
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your data</CardTitle>
          <CardDescription>Export everything, or delete your data / account. Deletes are permanent.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataManagement />
        </CardContent>
      </Card>
    </div>
  );
}
