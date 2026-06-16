"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  providerKeys,
  userSettings,
  type EngineId,
  type KeyProvider,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";
import { ALL_ENGINE_IDS } from "@/lib/engines";
import { getUserSettings } from "@/lib/core/keys";

const PROVIDERS: KeyProvider[] = ["perplexity", "openai", "gemini", "anthropic"];

const ENV_FALLBACK: Record<KeyProvider, () => boolean> = {
  perplexity: () => Boolean(process.env.PERPLEXITY_API_KEY?.trim()),
  openai: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  gemini: () => Boolean(process.env.GOOGLE_GENAI_API_KEY?.trim()),
  anthropic: () => Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
};

export type ProviderKeyStatus = {
  provider: KeyProvider;
  hasUserKey: boolean;
  masked: string | null; // masked preview of the user key (never the plaintext)
  hasEnvFallback: boolean;
};

export type SettingsState = {
  keys: ProviderKeyStatus[];
  enabledEngines: EngineId[];
  samples: number;
  temperature: number;
  maxSpendPerRunUsd: number | null;
  maxSpendMonthlyUsd: number | null;
  allEngines: EngineId[];
};

export async function getSettingsState(): Promise<SettingsState> {
  const user = await requireUser();
  const rows = await db.select().from(providerKeys).where(eq(providerKeys.userId, user.id));
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  const keys: ProviderKeyStatus[] = PROVIDERS.map((p) => {
    const row = byProvider.get(p);
    let masked: string | null = null;
    if (row) {
      try {
        masked = maskSecret(decryptSecret(row.ciphertext, row.nonce));
      } catch {
        masked = "••••";
      }
    }
    return { provider: p, hasUserKey: Boolean(row), masked, hasEnvFallback: ENV_FALLBACK[p]() };
  });

  const s = await getUserSettings(user.id);
  return {
    keys,
    enabledEngines: s.enabledEngines,
    samples: s.samples,
    temperature: s.temperature,
    maxSpendPerRunUsd: s.maxSpendPerRunUsd,
    maxSpendMonthlyUsd: s.maxSpendMonthlyUsd,
    allEngines: ALL_ENGINE_IDS,
  };
}

const ProviderSchema = z.enum(["perplexity", "openai", "gemini", "anthropic"]);

export async function saveProviderKey(provider: KeyProvider, key: string): Promise<void> {
  const user = await requireUser();
  ProviderSchema.parse(provider);
  const clean = key.trim();
  if (clean.length < 8) throw new Error("That doesn't look like a valid API key.");

  const { ciphertext, nonce } = encryptSecret(clean);
  await db
    .insert(providerKeys)
    .values({ userId: user.id, provider, ciphertext, nonce })
    .onConflictDoUpdate({
      target: [providerKeys.userId, providerKeys.provider],
      set: { ciphertext, nonce, updatedAt: new Date() },
    });
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

export async function deleteProviderKey(provider: KeyProvider): Promise<void> {
  const user = await requireUser();
  ProviderSchema.parse(provider);
  await db
    .delete(providerKeys)
    .where(and(eq(providerKeys.userId, user.id), eq(providerKeys.provider, provider)));
  revalidatePath("/app/settings");
  revalidatePath("/app");
}

/** Verify a key works by making a minimal authenticated call. Never stores it. */
export async function testProviderKey(
  provider: KeyProvider,
  key: string,
): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  ProviderSchema.parse(provider);
  const k = key.trim();
  if (!k) return { ok: false, message: "Enter a key first." };

  try {
    if (provider === "openai") {
      await new OpenAI({ apiKey: k }).models.list();
    } else if (provider === "anthropic") {
      await new Anthropic({ apiKey: k }).models.list();
    } else if (provider === "gemini") {
      // Free listing call — validates the key without spending tokens.
      await new GoogleGenAI({ apiKey: k }).models.list();
    } else {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "sonar", messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, message: "Invalid key." };
      if (!res.ok && res.status >= 500) return { ok: false, message: "Provider error — try again." };
    }
    return { ok: true, message: "Connected." };
  } catch (e) {
    // Classify by HTTP status when the SDK exposes it (don't call a transient 5xx invalid).
    const status =
      (e as { status?: number }).status ?? (e as { statusCode?: number }).statusCode;
    if (status === 401 || status === 403) return { ok: false, message: "Invalid key." };
    if (status === 429 || (typeof status === "number" && status >= 500)) {
      return { ok: false, message: "Provider error — try again." };
    }
    const msg = e instanceof Error ? e.message : "Failed.";
    if (/401|403|unauthor|invalid api key|permission/i.test(msg)) {
      return { ok: false, message: "Invalid key." };
    }
    return { ok: false, message: msg.slice(0, 120) };
  }
}

const AuditSettingsSchema = z.object({
  enabledEngines: z.array(z.enum(["perplexity", "openai", "gemini", "claude"])).min(1).max(4),
  samples: z.number().int().min(1).max(10),
  temperature: z.number().min(0).max(1),
  maxSpendPerRunUsd: z.number().min(0).max(1000).nullable(),
  maxSpendMonthlyUsd: z.number().min(0).max(10000).nullable(),
});

export async function saveAuditSettings(input: {
  enabledEngines: EngineId[];
  samples: number;
  temperature: number;
  maxSpendPerRunUsd: number | null;
  maxSpendMonthlyUsd: number | null;
}): Promise<void> {
  const user = await requireUser();
  const data = AuditSettingsSchema.parse(input);

  await db
    .insert(userSettings)
    .values({ userId: user.id, ...data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { ...data, updatedAt: new Date() },
    });
  revalidatePath("/app/settings");
  revalidatePath("/app");
}
