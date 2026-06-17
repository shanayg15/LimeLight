import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { embeddings, EMBEDDING_DIM, type EmbeddingSourceType } from "@/lib/db/schema";

/**
 * Retrieval for content grounding (M6) + the assistant (M8).
 *
 * Anthropic (our generation provider) has no embeddings API, so the VECTOR path
 * uses OpenAI text-embedding-3-small when an OpenAI key is available. With no key
 * we fall back to LEXICAL retrieval over the same stored chunks — still real
 * grounding over the user's OWN data, never fabrication. The pure cores
 * (chunkText / lexicalRank / cosineSim) are eval-tested without DB or network.
 */

export const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_CHUNK_CHARS = 1200;
const MAX_CHUNKS_PER_PAGE = 10;
/** Cap candidate chunks scanned by the keyless lexical fallback. */
const LEXICAL_CANDIDATE_CAP = 400;

// ── Pure cores ────────────────────────────────────────────────────────────

/** Split text into ~MAX_CHUNK_CHARS chunks on paragraph/sentence boundaries. */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const out: string[] = [];
  // Prefer sentence boundaries; fall back to hard slicing for run-ons.
  const sentences = clean.match(/[^.!?]+[.!?]+|\s*[^.!?]+$/g) ?? [clean];
  let buf = "";
  for (const s of sentences) {
    if (buf && buf.length + s.length > maxChars) {
      out.push(buf.trim());
      buf = "";
    }
    if (s.length > maxChars) {
      for (let i = 0; i < s.length; i += maxChars) out.push(s.slice(i, i + maxChars).trim());
    } else {
      buf += s;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "was",
  "were", "be", "by", "at", "as", "it", "this", "that", "from", "what", "who", "how", "do",
  "does", "you", "your", "my", "i", "me", "we", "they", "their", "about", "best", "vs",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export type RankedChunk<T> = T & { score: number };

/**
 * Rank chunks by query-token overlap (TF, length-normalized). Deterministic
 * keyless retrieval over the user's own stored chunks.
 */
export function lexicalRank<T extends { content: string }>(query: string, chunks: T[], k = 6): RankedChunk<T>[] {
  const qTokens = new Set(tokenize(query));
  if (qTokens.size === 0) return [];
  const scored = chunks.map((c) => {
    const tokens = tokenize(c.content);
    if (tokens.length === 0) return { ...c, score: 0 };
    let hits = 0;
    for (const t of tokens) if (qTokens.has(t)) hits += 1;
    // Length-normalize so long chunks don't dominate purely by size.
    return { ...c, score: hits / Math.sqrt(tokens.length) };
  });
  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── OpenAI embedding (vector path) ──────────────────────────────────────────

/** Embed texts with OpenAI; returns null when no key (caller falls back to lexical). */
export async function embedTexts(texts: string[], apiKey: string | null): Promise<number[][] | null> {
  if (!apiKey || texts.length === 0) return null;
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: texts });
  return res.data.map((d) => d.embedding as number[]);
}

// ── DB ingestion + retrieval ──────────────────────────────────────────────

export type IngestPage = { url: string; sourceType: EmbeddingSourceType; topic?: string | null; text: string };

/**
 * Chunk + (optionally) embed pages and store them. Idempotent per (subject,url):
 * prior chunks for a URL are replaced. Embeds via OpenAI when a key is given,
 * else stores lexical chunks (model='lexical', embedding=null).
 */
export async function ingestPages(
  subjectId: string,
  pages: IngestPage[],
  apiKey: string | null,
): Promise<{ chunks: number; embedded: boolean }> {
  const { db } = await import("@/lib/db/client");

  const rows: {
    subjectId: string;
    sourceType: EmbeddingSourceType;
    url: string;
    topic: string | null;
    chunkIdx: number;
    content: string;
  }[] = [];
  for (const page of pages) {
    const chunks = chunkText(page.text).slice(0, MAX_CHUNKS_PER_PAGE);
    chunks.forEach((content, chunkIdx) =>
      rows.push({ subjectId, sourceType: page.sourceType, url: page.url, topic: page.topic ?? null, chunkIdx, content }),
    );
  }
  if (rows.length === 0) return { chunks: 0, embedded: false };

  // Replace prior chunks for these URLs (idempotent re-ingest).
  const urls = [...new Set(pages.map((p) => p.url))];
  for (const url of urls) {
    await db.delete(embeddings).where(and(eq(embeddings.subjectId, subjectId), eq(embeddings.url, url)));
  }

  let vectors: number[][] | null = null;
  try {
    vectors = await embedTexts(rows.map((r) => r.content), apiKey);
  } catch {
    vectors = null; // embedding failed — degrade to lexical, never throw
  }
  const embedded = vectors != null && vectors.length === rows.length && vectors.every((v) => v.length === EMBEDDING_DIM);

  await db.insert(embeddings).values(
    rows.map((r, i) => ({
      ...r,
      embedding: embedded ? vectors![i] : null,
      model: embedded ? EMBEDDING_MODEL : "lexical",
    })),
  );
  return { chunks: rows.length, embedded };
}

export type RetrievedChunk = {
  id: string;
  url: string;
  sourceType: EmbeddingSourceType;
  content: string;
  score: number;
};

/**
 * Retrieve the top-k chunks for a query. Uses the pgvector cosine index when
 * embedded vectors exist (+ a key to embed the query), else lexical fallback.
 */
export async function retrieveChunks(
  subjectId: string,
  query: string,
  opts: { k?: number; apiKey?: string | null } = {},
): Promise<RetrievedChunk[]> {
  const { db } = await import("@/lib/db/client");
  const k = opts.k ?? 6;

  const hasVectors = await db
    .select({ id: embeddings.id })
    .from(embeddings)
    .where(and(eq(embeddings.subjectId, subjectId), isNotNull(embeddings.embedding)))
    .limit(1);

  if (hasVectors.length > 0 && opts.apiKey) {
    const qv = await embedTexts([query], opts.apiKey).catch(() => null);
    // Guard the query dimension — a mismatched-dim literal makes Postgres throw.
    // On mismatch fall through to lexical instead of crashing or returning nothing.
    if (qv?.[0] && qv[0].length === EMBEDDING_DIM) {
      const literal = `[${qv[0].join(",")}]`;
      const ranked = await db
        .select({ id: embeddings.id, url: embeddings.url, sourceType: embeddings.sourceType, content: embeddings.content })
        .from(embeddings)
        .where(and(eq(embeddings.subjectId, subjectId), isNotNull(embeddings.embedding)))
        .orderBy(sql`${embeddings.embedding} <=> ${literal}::vector`)
        .limit(k);
      return ranked.map((r, i) => ({ ...r, score: 1 - i / Math.max(1, ranked.length) }));
    }
  }

  // Lexical fallback over the subject's chunks. Bound the candidate set (most
  // recent first) so a heavily-ingested subject can't load unbounded rows.
  const rows = await db
    .select({ id: embeddings.id, url: embeddings.url, sourceType: embeddings.sourceType, content: embeddings.content })
    .from(embeddings)
    .where(eq(embeddings.subjectId, subjectId))
    .orderBy(desc(embeddings.createdAt))
    .limit(LEXICAL_CANDIDATE_CAP);
  return lexicalRank(query, rows, k);
}
