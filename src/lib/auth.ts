import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

type AuthInstance = ReturnType<typeof createAuth>;
let authInstance: AuthInstance | null = null;

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
    },
    trustedOrigins: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://*.vercel.app",
      ...(process.env.NEXT_PUBLIC_APP_URL
        ? [process.env.NEXT_PUBLIC_APP_URL]
        : []),
    ],
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    plugins: [nextCookies()],
  });
}

/**
 * Lazily returns the Better Auth instance so build steps without DB env vars stay safe.
 */
export function getAuth(): AuthInstance {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}
