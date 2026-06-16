// Next.js 16 renamed `middleware.ts` -> `proxy.ts` (exported fn: `proxy`).
// Edge-safe: imports only the bcrypt/db-free authConfig.
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Next 16 requires a function exported as `proxy` (or default) — use a
// re-export statement so the bundler recognizes it (a destructured
// `export const { auth: proxy }` is NOT detected).
export { auth as proxy };

export const config = {
  // Run on everything EXCEPT /api (so /api/auth works), _next assets, and static files.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp)$).*)",
  ],
};
