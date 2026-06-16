import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/** Current authenticated user (or null). Use in server components / actions. */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Require an authenticated user. Redirects to /login if absent. This is the
 * real authorization check — proxy.ts is only an optimistic edge redirect.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
