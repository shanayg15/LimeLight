import { lookup } from "node:dns/promises";

/**
 * SSRF protection for the site crawler. We only ever fetch the user's declared
 * site + same-origin links, but a malicious `siteUrl` (or a DNS-rebinding /
 * redirect to a private address) must never let us reach internal services.
 *
 * Two layers:
 *  - `validatePublicUrl` — synchronous, no network. Rejects non-http(s) schemes,
 *    loopback/private/link-local IP LITERALS, and obvious internal hostnames.
 *    Pure → eval-tested without touching the network.
 *  - `assertResolvesPublic` — async DNS resolution; rejects when a hostname
 *    resolves to a blocked address (rebinding / internal DNS). Used at fetch time.
 */

export class UrlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UrlValidationError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "metadata.google.internal",
]);

// Hostnames ending in these are non-public by convention.
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".lan", ".home", ".test", ".example", ".invalid"];

/** True if `s` is a private/loopback/link-local IPv4 literal. */
export function isPrivateIPv4(s: string): boolean {
  const m = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8 ("this host")
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && o[2] === 0) return true; // 192.0.0.0/24 (IETF)
  if (a >= 224) return true; // multicast + reserved (224+/255.255.255.255)
  return false;
}

/** True if `s` is a loopback/private/link-local IPv6 literal (brackets allowed). */
export function isBlockedIPv6(s: string): boolean {
  let h = s.trim();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  // Strip a zone id (fe80::1%eth0).
  h = h.split("%")[0];
  if (!h.includes(":")) return false;
  const low = h.toLowerCase();
  if (low === "::1" || low === "::") return true; // loopback / unspecified
  if (low.startsWith("fe8") || low.startsWith("fe9") || low.startsWith("fea") || low.startsWith("feb"))
    return true; // fe80::/10 link-local
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7 unique-local
  // IPv4-mapped (::ffff:127.0.0.1) — check the embedded v4.
  const v4 = low.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (low.startsWith("::ffff:") && v4 && isPrivateIPv4(v4[1])) return true;
  return false;
}

/** True if a host string is an IP literal in a blocked range. */
export function isBlockedIpLiteral(host: string): boolean {
  return isPrivateIPv4(host) || isBlockedIPv6(host);
}

/**
 * Validate + normalize a URL for crawling (synchronous, no DNS). Prepends
 * https:// if scheme-less. Throws UrlValidationError on anything non-public.
 */
export function validatePublicUrl(raw: string): URL {
  if (!raw || !raw.trim()) throw new UrlValidationError("Empty URL.");
  const candidate = raw.trim();

  // Decide whether to parse as-is or assume https. A scheme present (file:, ftp:,
  // data:, anything://) is parsed as-is so the protocol guard below rejects it;
  // a scheme-less `host[:port][/path]` gets https:// prepended. Disambiguate
  // "scheme:..." from "host:port" by what follows the colon.
  let url: URL;
  try {
    const m = candidate.match(/^([a-z][a-z0-9+.-]*):(.*)$/i);
    if (!m) {
      url = new URL(`https://${candidate}`);
    } else if (/^\d+(\/|\?|#|$)/.test(m[2])) {
      url = new URL(`https://${candidate}`); // colon introduced a port, not a scheme
    } else {
      url = new URL(candidate); // real scheme (http(s):// → kept; others → rejected below)
    }
  } catch {
    throw new UrlValidationError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UrlValidationError(`Only http(s) URLs can be crawled (got ${url.protocol}).`);
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new UrlValidationError("Missing hostname.");
  if (BLOCKED_HOSTNAMES.has(host)) throw new UrlValidationError("Refusing to crawl a loopback host.");
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UrlValidationError("Refusing to crawl a non-public hostname.");
  }
  if (isBlockedIpLiteral(host)) {
    throw new UrlValidationError("Refusing to crawl a private/loopback IP address.");
  }
  return url;
}

/**
 * Resolve a hostname and ensure every address is public (blocks DNS rebinding /
 * internal DNS pointing at private space). Network call — used at fetch time,
 * not in evals. Throws UrlValidationError on a blocked address.
 */
export async function assertResolvesPublic(hostname: string): Promise<void> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isBlockedIpLiteral(host)) {
    throw new UrlValidationError("Refusing to connect to a private/loopback IP.");
  }
  // An IP literal needs no DNS resolution.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) return;

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UrlValidationError(`Could not resolve ${host}.`);
  }
  for (const a of addrs) {
    if (isBlockedIpLiteral(a.address)) {
      throw new UrlValidationError(`${host} resolves to a private address — refusing to connect.`);
    }
  }
}
