import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for per-user provider keys stored in the DB. The key comes from
 * ENCRYPTION_KEY (32-byte base64). Plaintext keys are decrypted only in-process
 * when calling an adapter — never returned to the client, never logged.
 */
function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set (generate: openssl rand -base64 32).");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptSecret(plaintext: string): { ciphertext: string; nonce: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // ciphertext = encrypted bytes ++ 16-byte auth tag, base64-encoded.
  return {
    ciphertext: Buffer.concat([enc, tag]).toString("base64"),
    nonce: iv.toString("base64"),
  };
}

export function decryptSecret(ciphertext: string, nonce: string): string {
  const iv = Buffer.from(nonce, "base64");
  const data = Buffer.from(ciphertext, "base64");
  // Fail loudly on malformed input rather than relying on the GCM tag check alone.
  if (iv.length !== 12) throw new Error("Invalid nonce length.");
  if (data.length < 16) throw new Error("Ciphertext too short.");
  const tag = data.subarray(data.length - 16);
  const enc = data.subarray(0, data.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Mask a secret for display: keep the last 4 chars. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 4) return "••••";
  return `••••${plaintext.slice(-4)}`;
}
