import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  providerKeys,
  userSettings,
  type EngineId,
  type KeyProvider,
  type UserSettings,
} from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { getEngine } from "@/lib/engines";

export function engineKeyProvider(engine: EngineId): KeyProvider {
  return engine === "claude" ? "anthropic" : engine;
}

const ENV_FALLBACK: Record<KeyProvider, () => string | undefined> = {
  perplexity: () => process.env.PERPLEXITY_API_KEY,
  openai: () => process.env.OPENAI_API_KEY,
  gemini: () => process.env.GOOGLE_GENAI_API_KEY,
  anthropic: () => process.env.ANTHROPIC_API_KEY,
};

/**
 * Resolve a provider key: per-user encrypted key → env fallback (self-host/dev)
 * → null. Decrypted only in-process; never returned to the client, never logged.
 */
export async function getProviderKey(userId: string, provider: KeyProvider): Promise<string | null> {
  const [row] = await db
    .select()
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
    .limit(1);
  if (row) {
    try {
      const key = decryptSecret(row.ciphertext, row.nonce).trim();
      if (key) return key;
    } catch {
      // corrupt/rotated ENCRYPTION_KEY — fall through to env
    }
  }
  return ENV_FALLBACK[provider]()?.trim() || null;
}

export async function getEngineKey(userId: string, engine: EngineId): Promise<string | null> {
  return getProviderKey(userId, engineKeyProvider(engine));
}

/** Whether a provider has any key (per-user row or env) — without decrypting. */
export async function hasProviderKey(userId: string, provider: KeyProvider): Promise<boolean> {
  const [row] = await db
    .select({ id: providerKeys.id })
    .from(providerKeys)
    .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
    .limit(1);
  if (row) return true;
  return Boolean(ENV_FALLBACK[provider]()?.trim());
}

/** Engines that are implemented AND have a usable key for this user. */
export async function availableEnginesForUser(userId: string): Promise<EngineId[]> {
  const all: EngineId[] = ["perplexity", "openai", "gemini", "claude"];
  const out: EngineId[] = [];
  for (const e of all) {
    if (getEngine(e) && (await hasProviderKey(userId, engineKeyProvider(e)))) out.push(e);
  }
  return out;
}

export const DEFAULT_SETTINGS = {
  enabledEngines: ["perplexity"] as EngineId[],
  samples: 3,
  temperature: 0.2,
  maxSpendPerRunUsd: null as number | null,
  maxSpendMonthlyUsd: null as number | null,
};

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (row) return row;
  // Defaults (not persisted until first save).
  return {
    userId,
    enabledEngines: DEFAULT_SETTINGS.enabledEngines,
    samples: DEFAULT_SETTINGS.samples,
    temperature: DEFAULT_SETTINGS.temperature,
    maxSpendPerRunUsd: null,
    maxSpendMonthlyUsd: null,
    updatedAt: new Date(),
  };
}
