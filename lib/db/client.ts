import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env (see README).");
}

/**
 * Cache the postgres-js client on globalThis so Next.js dev HMR doesn't open a
 * fresh connection pool on every hot reload and exhaust Postgres connections.
 */
const globalForDb = globalThis as unknown as {
  __limelightPg?: ReturnType<typeof postgres>;
};

const client = globalForDb.__limelightPg ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__limelightPg = client;

export const db = drizzle(client, { schema });
export type DB = typeof db;
