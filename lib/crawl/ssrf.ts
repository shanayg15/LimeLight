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

/**
 * Expand an IPv6 literal to its 8 16-bit words, resolving `::` compression and
 * any embedded dotted IPv4 (e.g. ::ffff:127.0.0.1). Returns null if not IPv6.
 * Parsing to words means textual form (dotted vs hex, e.g. `::ffff:7f00:1`)
 * can't be used to dodge the range checks.
 */
function ipv6Words(s: string): number[] | null {
  let h = s.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  h = h.split("%")[0]; // drop a zone id (fe80::1%eth0)
  if (!h.includes(":")) return null;

  // Fold a trailing dotted IPv4 into two hex words so word parsing is uniform.
  const v4m = h.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4m) {
    const o = [v4m[2], v4m[3], v4m[4], v4m[5]].map(Number);
    if (o.some((n) => n > 255)) return null;
    h = `${v4m[1]}${(((o[0] << 8) | o[1]) >>> 0).toString(16)}:${(((o[2] << 8) | o[3]) >>> 0).toString(16)}`;
  }

  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;

  let groups: string[];
  if (tail === null) {
    groups = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;
  const words = groups.map((g) => (g === "" ? 0 : parseInt(g, 16)));
  if (words.some((w) => Number.isNaN(w) || w < 0 || w > 0xffff)) return null;
  return words;
}

/** True if `s` is a loopback/private/link-local IPv6 literal (brackets allowed). */
export function isBlockedIPv6(s: string): boolean {
  const w = ipv6Words(s);
  if (!w) return false;

  if (w.every((x) => x === 0)) return true; // :: unspecified
  if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return true; // ::1 loopback
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local

  // Embedded IPv4 in the low 32 bits: mapped (::ffff:0:0/96), IPv4-compatible
  // (::/96) and NAT64 (64:ff9b::/96) — block when the embedded v4 is private.
  const high96Zero = w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0;
  const mapped = high96Zero && w[5] === 0xffff;
  const compat = high96Zero && w[5] === 0;
  const nat64 = w[0] === 0x0064 && w[1] === 0xff9b && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0;
  if (mapped || compat || nat64) {
    const v4 = `${(w[6] >> 8) & 0xff}.${w[6] & 0xff}.${(w[7] >> 8) & 0xff}.${w[7] & 0xff}`;
    if (isPrivateIPv4(v4)) return true;
  }
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

  // Strip brackets and a trailing FQDN dot ("localhost." resolves like "localhost").
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
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
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
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
