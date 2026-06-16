import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { getUserByEmail } from "@/lib/db/users";

// Fail fast in production if the session secret is missing (dev auto-generates
// an ephemeral one, which silently invalidates sessions on restart).
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is not set — generate one with `openssl rand -base64 32`.");
}

// Compared against when no user/hash exists, so bcrypt work is equal on both
// branches — mitigates timing-based user enumeration on the login endpoint.
const DUMMY_HASH = bcrypt.hashSync("limelight-timing-equalizer", 12);

/**
 * Full Node-runtime Auth.js instance. Powers the API route + server-side auth().
 * Credentials + JWT sessions (the only session strategy Credentials supports).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const user = await getUserByEmail(email);
        // Always run a compare (dummy hash when absent) to keep timing uniform
        // across "no such user" and "wrong password".
        const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
        if (!user?.passwordHash || !ok) return null;

        // Return ONLY safe fields — never the password hash (it would land in the JWT).
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
});
