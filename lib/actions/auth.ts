"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import { createUser, getUserByEmail } from "@/lib/db/users";

export type AuthFormState = { error?: string };

const SignupSchema = z.object({
  name: z.string().trim().max(120).optional(),
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(200),
});

/** Only allow same-origin app paths as a post-login target — blocks open redirects. */
function safeRedirect(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  try {
    const path = value.startsWith("/") ? value : new URL(value).pathname;
    if (!path.startsWith("//") && (path.startsWith("/app") || path.startsWith("/onboarding"))) {
      return path;
    }
  } catch {
    // not a parseable URL — fall through to the default
  }
  return "/app";
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const redirectTo = safeRedirect(formData.get("callbackUrl"));
  try {
    await signIn("credentials", { email, password, redirectTo });
  } catch (error) {
    // AuthError = bad credentials; anything else (incl. NEXT_REDIRECT on success) re-throws.
    if (error instanceof AuthError) return { error: "Invalid email or password." };
    throw error;
  }
  return {};
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = SignupSchema.safeParse({
    name: (formData.get("name") as string) || undefined,
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const { name, email, password } = parsed.data;
  if (await getUserByEmail(email)) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await createUser({ email, name, passwordHash });

  try {
    await signIn("credentials", { email, password, redirectTo: "/app" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Account created — please log in." };
    throw error;
  }
  return {};
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
