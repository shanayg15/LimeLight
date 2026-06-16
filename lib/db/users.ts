import { eq } from "drizzle-orm";
import { db } from "./client";
import { users, type User } from "./schema";

/** Emails are stored and compared lowercased to avoid duplicate accounts. */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createUser(data: {
  email: string;
  name?: string | null;
  passwordHash: string;
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      email: normalizeEmail(data.email),
      name: data.name ?? null,
      passwordHash: data.passwordHash,
    })
    .returning();
  return row;
}
