import { toNodeHandler } from "better-auth/node";
import type { RequestHandler } from "express";

import type { Auth } from "./auth";

/** This process's Better Auth, or null while a managed instance waits for its init. */
export interface AuthSource {
  current(): Promise<Auth | null>;
}

/** Better Auth built at startup, as self-hosted instances have it. */
export function fixedAuth(auth: Auth): AuthSource {
  return { current: () => Promise.resolve(auth) };
}

/**
 * Serves `/api/auth/*`. Mount it before any body parser: Better Auth reads the raw body.
 * A managed instance's waiting gate answers first while there is no auth yet.
 */
export function authHandler(auth: AuthSource): RequestHandler {
  return async (request, response) => {
    const current = await auth.current();
    if (!current) {
      throw new Error("Auth was requested before the instance was assigned");
    }
    await toNodeHandler(current)(request, response);
  };
}
