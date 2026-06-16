import type { NextAuthConfig } from "next-auth";

/**
 * EDGE-SAFE Auth.js config. Imported by both `proxy.ts` (Next 16's renamed
 * middleware, runs on the edge) and the full Node instance in `lib/auth.ts`.
 * It MUST NOT import bcryptjs, the DB, or any Node-only module — the real
 * Credentials `authorize()` lives in lib/auth.ts to keep this bundle edge-safe.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  // Real provider added in lib/auth.ts (keeps bcrypt/db out of the edge bundle).
  providers: [],
  callbacks: {
    // Optimistic edge gate used by proxy.ts. Protected routes re-verify with auth().
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isProtected = path.startsWith("/app") || path.startsWith("/onboarding");
      if (isProtected) return isLoggedIn; // false -> redirect to pages.signIn (/login)
      // Bounce already-authenticated users away from the auth pages.
      if (isLoggedIn && (path === "/login" || path === "/signup")) {
        return Response.redirect(new URL("/app", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) session.user.id = token.id as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
