import { Inngest } from "inngest";

/**
 * Shared Inngest client. Durable audit/digest functions are registered from M3.
 * `isDev` runs the local dev mode (introspection works without a signing key);
 * production (NODE_ENV=production) uses cloud mode with INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({
  id: "limelight",
  isDev: process.env.NODE_ENV !== "production",
});
