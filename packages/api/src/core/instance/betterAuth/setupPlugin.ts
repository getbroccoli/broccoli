import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { runWithAdapter } from "@better-auth/core/context";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

import { ApplicationError } from "../../applicationError";
import { authDatabase } from "../../auth";
import { type Orm, ormOf, type Transact } from "../../db";
import { PrincipalSecurityContext } from "../../security";
import { createOwnerAtSetup, hasOwner, readSetupHolder, startSetup } from "../app";
import { OwnerExistsError, SETUP_SESSION_DAYS, SetupInProgressError } from "../domain";
import { readSetupToken, SETUP_COOKIE } from "./setupCookie";

const OWNER_EXISTS = { code: "OWNER_EXISTS", message: "The owner account already exists" };
const SETUP_IN_PROGRESS = {
  code: "SETUP_IN_PROGRESS",
  message: "Setup is in progress on another device",
};
const NOT_AT_OWNER_STEP = {
  code: "NOT_AT_OWNER_STEP",
  message: "Finish the import before creating the owner",
};

const setupBody = z.object({
  email: z.string(),
  password: z.string(),
});

type SetupBody = z.infer<typeof setupBody>;

/**
 * Self-hosted setup before the owner exists. `POST /api/auth/setup/start` gives setup
 * to the first browser, or renews it for the browser holding it, through the
 * `broccoli_setup` cookie. `POST /api/auth/setup`, the last step, creates the owner
 * for that browser and signs them in; it answers after the handlers of
 * `instance.owner_claimed` and `instance.setup_completed` have run. `setupRouter`
 * limits and origin-checks both before they run.
 */
export function setupPlugin(orm: Orm, transact: Transact) {
  return {
    id: "setup",
    endpoints: {
      startSetup: createAuthEndpoint("/setup/start", { method: "POST" }, async (ctx) => {
        const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
        const session = await refusingSetupConflicts(() =>
          transact((tx) =>
            startSetup(PrincipalSecurityContext.system(), tx, { token, now: new Date() }),
          ),
        );
        setSetupCookie(ctx, session.token, SETUP_SESSION_DAYS * DAY_SECONDS);
        return ctx.json({ holder: "you" });
      }),
      setup: createAuthEndpoint("/setup", { method: "POST", body: setupBody }, async (ctx) => {
        assertValidCredentials(ctx.body, ctx.context.password.config);
        const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
        // Checked early to skip the slow hashing; the transaction checks again.
        await assertHoldsSetup(orm, token);
        // Hashing is slow, so it happens before the transaction takes its lock.
        const passwordHash = await ctx.context.password.hash(ctx.body.password);
        const owner = await refusingSetupConflicts(() =>
          createOwner(transact, ctx, token, ctx.body.email.toLowerCase(), passwordHash),
        );
        await setSessionCookie(ctx, owner);
        setSetupCookie(ctx, "", 0);
        return ctx.json({ user: { id: owner.user.id, email: owner.user.email } });
      }),
    },
  } satisfies BetterAuthPlugin;
}

const DAY_SECONDS = 24 * 60 * 60;

async function assertHoldsSetup(orm: Orm, token: string | null): Promise<void> {
  if (await hasOwner(orm)) {
    throw APIError.from("CONFLICT", OWNER_EXISTS);
  }
  if ((await readSetupHolder(orm, { token, now: new Date() })) !== "you") {
    throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
  }
}

function assertValidCredentials(
  { email, password }: SetupBody,
  limits: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (!z.email().safeParse(email).success) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
  }
  if (password.length < limits.minPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
  }
  if (password.length > limits.maxPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
  }
}

/** Creates the owner with a password and a session, in one transaction. */
function createOwner(
  transact: Transact,
  ctx: GenericEndpointContext,
  token: string | null,
  email: string,
  passwordHash: string,
) {
  const { internalAdapter, options } = ctx.context;
  return transact((tx) =>
    // Better Auth's writes join the transaction that holds the instance lock.
    runWithAdapter(authDatabase(ormOf(tx))(options), () =>
      createOwnerAtSetup(
        PrincipalSecurityContext.system(),
        tx,
        { token, now: new Date() },
        async () => {
          const user = await internalAdapter.createUser(
            { email, name: "", emailVerified: false },
            { method: "email-password" },
          );
          await internalAdapter.linkAccount({
            userId: user.id,
            providerId: "credential",
            accountId: user.id,
            password: passwordHash,
          });
          return { user, session: await internalAdapter.createSession(user.id) };
        },
      ),
    ),
  );
}

/** Answers the refusals of setup as HTTP conflicts. */
async function refusingSetupConflicts<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw APIError.from("CONFLICT", OWNER_EXISTS);
    }
    if (error instanceof SetupInProgressError) {
      throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
    }
    if (error instanceof ApplicationError && error.code === "CONFLICT") {
      throw APIError.from("CONFLICT", NOT_AT_OWNER_STEP);
    }
    throw error;
  }
}

/** Sets the setup cookie like the session cookie: HttpOnly, SameSite=Lax, Secure on HTTPS. */
function setSetupCookie(ctx: GenericEndpointContext, token: string, maxAge: number): void {
  ctx.setCookie(SETUP_COOKIE, token, {
    ...ctx.context.authCookies.sessionToken.attributes,
    maxAge,
  });
}
