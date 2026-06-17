import { assertResolvesPublic, validatePublicUrl, UrlValidationError } from "./ssrf";

/** Clear, identifiable UA so site owners can see + block us if they wish. */
export const CRAWLER_USER_AGENT =
  "LimelightBot/0.1 (+https://github.com/shanayg15/LimeLight; AI-readiness audit)";

export type FetchResult = {
  status: number;
  ok: boolean;
  contentType: string;
  body: string;
  finalUrl: string;
  /** True if the response was HTML we could read. */
  isHtml: boolean;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2_000_000; // 2 MB per page

/**
 * Fetch one URL politely + safely: SSRF-checked (incl. DNS + each redirect hop),
 * timed out, byte-capped, identified UA. Never follows a redirect to a private
 * address. Throws UrlValidationError on an unsafe URL; returns status>=400 as data.
 */
export async function politeFetch(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; maxRedirects?: number } = {},
): Promise<FetchResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? 4;

  let url = validatePublicUrl(rawUrl);
  let hops = 0;

  while (true) {
    await assertResolvesPublic(url.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        redirect: "manual", // we re-validate every hop ourselves
        signal: controller.signal,
        headers: {
          "User-Agent": CRAWLER_USER_AGENT,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
    } finally {
      clearTimeout(timer);
    }

    // Manual redirect handling — re-run SSRF validation on the destination.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hops >= maxRedirects) {
        return { status: res.status, ok: false, contentType: "", body: "", finalUrl: url.toString(), isHtml: false };
      }
      let next: URL;
      try {
        next = validatePublicUrl(new URL(loc, url).toString());
      } catch (e) {
        if (e instanceof UrlValidationError) throw e;
        throw new UrlValidationError("Redirect to an invalid URL.");
      }
      url = next;
      hops += 1;
      continue;
    }

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml");

    // Read with a byte cap so a huge/streaming page can't exhaust memory.
    const body = await readCapped(res, maxBytes);
    return { status: res.status, ok: res.ok, contentType, body, finalUrl: url.toString(), isHtml };
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
      if (total >= maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks)).slice(0, maxBytes);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
