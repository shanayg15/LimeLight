import { and, desc, eq, gte } from "drizzle-orm";
import type { AnalyticsEventType } from "@/lib/db/schema";

/**
 * Agent Analytics (M8, optional) — classify two AI signals on the user's OWN site:
 *  - AI human referrals: a visitor arriving FROM ChatGPT/Perplexity/etc. (referrer)
 *  - AI bot traffic: a known AI crawler fetching a page (user-agent)
 * Classification is PURE (eval-tested). We store NO PII — only the coarse engine,
 * path (query stripped), referrer HOST, and a truncated UA.
 */

export type Classification = { type: AnalyticsEventType; engine: string } | null;

// Known AI crawler UA tokens → engine label.
const BOT_AGENTS: { token: string; engine: string }[] = [
  { token: "gptbot", engine: "openai" },
  { token: "oai-searchbot", engine: "openai" },
  { token: "chatgpt-user", engine: "openai" },
  { token: "claudebot", engine: "claude" },
  { token: "claude-web", engine: "claude" },
  { token: "anthropic-ai", engine: "claude" },
  { token: "perplexitybot", engine: "perplexity" },
  { token: "perplexity-user", engine: "perplexity" },
  { token: "google-extended", engine: "gemini" },
  { token: "bytespider", engine: "bytedance" },
  { token: "amazonbot", engine: "amazon" },
  { token: "applebot-extended", engine: "apple" },
  { token: "ccbot", engine: "commoncrawl" },
  { token: "cohere-ai", engine: "cohere" },
  { token: "meta-externalagent", engine: "meta" },
];

// Referrer hosts → engine label (AI assistants that send human visitors).
const REFERRAL_HOSTS: { match: (host: string) => boolean; engine: string }[] = [
  { match: (h) => h === "chatgpt.com" || h === "chat.openai.com", engine: "openai" },
  { match: (h) => h.endsWith("perplexity.ai"), engine: "perplexity" },
  { match: (h) => h === "gemini.google.com" || h === "bard.google.com", engine: "gemini" },
  { match: (h) => h === "claude.ai", engine: "claude" },
  // Only the Copilot host — bare bing.com is ordinary web search, not an AI answer.
  { match: (h) => h === "copilot.microsoft.com", engine: "copilot" },
  { match: (h) => h === "you.com", engine: "you" },
];

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    // Maybe it's already a bare host.
    const h = url.trim().toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h) ? h.replace(/^www\./, "") : null;
  }
}

/**
 * Classify a hit. Bot (by UA) takes precedence over referral. Returns null when
 * neither an AI crawler nor an AI referrer is detected (we don't store those).
 */
export function classifyHit(input: { userAgent?: string | null; referrer?: string | null }): Classification {
  const ua = (input.userAgent ?? "").toLowerCase();
  for (const b of BOT_AGENTS) {
    if (ua.includes(b.token)) return { type: "bot", engine: b.engine };
  }
  const host = hostOf(input.referrer);
  if (host) {
    for (const r of REFERRAL_HOSTS) {
      if (r.match(host)) return { type: "referral", engine: r.engine };
    }
  }
  return null;
}

/** Strip query + hash from a path; force a leading slash; strip control chars; cap length. No PII. */
export function coarsePath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Drop query/hash, then strip control chars by code point (no control-char literal in source).
  let p = Array.from(raw.split(/[?#]/)[0].trim())
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c !== 127;
    })
    .join("");
  if (!p) return "/";
  // Coerce anything that isn't already a path into one (drop scheme/host if present).
  if (!p.startsWith("/")) p = "/" + p.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").replace(/^\/+/, "");
  return p.slice(0, 300) || "/";
}

/**
 * Reduce a user-agent to a COARSE, non-fingerprinting signal: the matched AI-bot
 * token, else a browser family. Never persists the full UA (a quasi-PII vector).
 */
export function coarseUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const u = ua.toLowerCase();
  for (const b of BOT_AGENTS) if (u.includes(b.token)) return b.token;
  if (u.includes("edg/") || u.includes("edge/")) return "Edge";
  if (u.includes("chrome/")) return "Chrome";
  if (u.includes("firefox/")) return "Firefox";
  if (u.includes("safari/")) return "Safari";
  if (/bot|crawler|spider/.test(u)) return "bot";
  return "other";
}

// ── ingest + aggregate (DB) ────────────────────────────────────────────────

export type CollectPayload = { subjectId: string; path?: string | null; referrer?: string | null; userAgent?: string | null };

/**
 * Classify + store a hit. Returns the stored type (or null if not an AI signal).
 * Stores only coarse, non-PII fields. Caller (the route) validates + rate-limits.
 */
export async function ingestAnalyticsEvent(payload: CollectPayload): Promise<AnalyticsEventType | null> {
  const cls = classifyHit({ userAgent: payload.userAgent, referrer: payload.referrer });
  if (!cls) return null;
  const { db } = await import("@/lib/db/client");
  const { analyticsEvents } = await import("@/lib/db/schema");
  await db.insert(analyticsEvents).values({
    subjectId: payload.subjectId,
    type: cls.type,
    engine: cls.engine,
    path: coarsePath(payload.path),
    referrer: hostOf(payload.referrer),
    userAgent: coarseUserAgent(payload.userAgent), // coarse family / bot token — never the full UA
  });
  return cls.type;
}

export type AnalyticsSummary = {
  hasEvents: boolean;
  referrals: number;
  bots: number;
  byEngine: { engine: string; referrals: number; bots: number }[];
  byDay: { date: string; referrals: number; bots: number }[];
  topBotPaths: { path: string; count: number }[];
};

export async function getAnalyticsForSubject(subjectId: string, days = 30): Promise<AnalyticsSummary> {
  const { db } = await import("@/lib/db/client");
  const { analyticsEvents } = await import("@/lib/db/schema");
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(analyticsEvents)
    .where(and(eq(analyticsEvents.subjectId, subjectId), gte(analyticsEvents.ts, since)))
    .orderBy(desc(analyticsEvents.ts));

  const byEngineMap = new Map<string, { referrals: number; bots: number }>();
  const byDayMap = new Map<string, { referrals: number; bots: number }>();
  const botPaths = new Map<string, number>();
  let referrals = 0;
  let bots = 0;

  for (const r of rows) {
    const isRef = r.type === "referral";
    if (isRef) referrals += 1;
    else bots += 1;
    const e = byEngineMap.get(r.engine) ?? { referrals: 0, bots: 0 };
    e[isRef ? "referrals" : "bots"] += 1;
    byEngineMap.set(r.engine, e);
    const day = r.ts.toISOString().slice(0, 10);
    const d = byDayMap.get(day) ?? { referrals: 0, bots: 0 };
    d[isRef ? "referrals" : "bots"] += 1;
    byDayMap.set(day, d);
    if (!isRef && r.path) botPaths.set(r.path, (botPaths.get(r.path) ?? 0) + 1);
  }

  return {
    hasEvents: rows.length > 0,
    referrals,
    bots,
    byEngine: [...byEngineMap.entries()].map(([engine, v]) => ({ engine, ...v })).sort((a, b) => b.referrals + b.bots - (a.referrals + a.bots)),
    byDay: [...byDayMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    topBotPaths: [...botPaths.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  };
}

/** The opt-in tracking snippet the user pastes on their OWN site. We never install it for them. */
export function buildSnippet(subjectId: string, baseUrl: string): string {
  const url = `${baseUrl}/api/collect?s=${subjectId}`;
  return `<script>(function(){try{var d=JSON.stringify({p:location.pathname,r:document.referrer});var u=${JSON.stringify(url)};if(navigator.sendBeacon){navigator.sendBeacon(u,d)}else{fetch(u,{method:"POST",body:d,keepalive:true,mode:"no-cors"})}}catch(e){}})();</script>`;
}
