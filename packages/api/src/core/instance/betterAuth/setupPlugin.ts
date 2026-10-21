import type { GenericEndpointContext } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import type { BetterAuthPlugin } from "better-auth";
import { setSessionCookie } from "better-auth/cookies";

import { ApplicationError } from "../../applicationError";
import type { Orm, Transact } from "../../db";
import { PrincipalSecurityContext } from "../../security";
import {
  createOwnerAtSetup,
  type DemoStart,
  readInstance,
  readSetupHolder,
  startDemoAtSetup,
  startSetup,
} from "../app";
import { demoExpiry, OwnerExistsError, SETUP_SESSION_DAYS, SetupInProgressError } from "../domain";
import { provisionalOwnerEmail } from "../helpers";
import { inAuthTransaction } from "./authTransaction";
import { assertValidCredentials, credentialsBody, linkPassword } from "./credentials";
import { readSetupToken, setSetupCookie } from "./setupCookie";

const SYSTEM = PrincipalSecurityContext.system();

const OWNER_EXISTS = { code: "OWNER_EXISTS", message: "The owner account already exists" };
const SETUP_IN_PROGRESS = {
  code: "SETUP_IN_PROGRESS",
  message: "Setup is in progress on another device",
};
const NOT_AT_OWNER_STEP = {
  code: "NOT_AT_OWNER_STEP",
  message: "Finish the import before creating the owner",
};
const NOT_AT_IMPORT_STEP = {
  code: "NOT_AT_IMPORT_STEP",
  message: "Name the company before starting the demo",
};

/**
 * Self-hosted setup before the owner exists. `POST /api/auth/setup/start` gives setup
 * to the first browser, or renews it for the browser holding it, through the
 * `broccoli_setup` cookie. `POST /api/auth/setup`, the last step, creates the owner
 * for that browser and signs them in; it answers after the handlers of
 * `instance.owner_claimed` and `instance.setup_completed` have run. Instead of the
 * import, `POST /api/auth/setup/demo` starts the demo for that browser, signed in as a
 * provisional owner without credentials (see `demoPlugin`). `setupRouter` limits and
 * origin-checks all of them before they run.
 */
export function setupPlugin(
  orm: Orm,
  transact: Transact,
  prepareDemoStart: () => Promise<DemoStart>,
) {
  return {
    id: "setup",
    endpoints: {
      startSetup: createAuthEndpoint("/setup/start", { method: "POST" }, async (ctx) => {
        const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
        const session = await refusingSetupConflicts(() =>
          transact((tx) => startSetup(SYSTEM, tx, { token, now: new Date() })),
        );
        setSetupCookie(ctx, session.token, SETUP_SESSION_DAYS * DAY_SECONDS);
        return ctx.json({ holder: "you" });
      }),
      setup: createAuthEndpoint(
        "/setup",
        { method: "POST", body: credentialsBody },
        async (ctx) => {
          assertValidCredentials(ctx.body, ctx.context.password.config);
          const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
          // Checked early to skip the slow hashing; the transaction checks again.
          await assertHoldsSetup(orm, token);
          // Hashing is slow, so it happens before the transaction takes its lock.
          const passwordHash = await ctx.context.password.hash(ctx.body.password);
          const owner = await refusingSetupConflicts(
            () => createOwner(transact, ctx, token, ctx.body.email.toLowerCase(), passwordHash),
            NOT_AT_OWNER_STEP,
          );
          await setSessionCookie(ctx, owner);
          setSetupCookie(ctx, "", 0);
          return ctx.json({ user: { id: owner.user.id, email: owner.user.email } });
        },
      ),
      startDemo: createAuthEndpoint("/setup/demo", { method: "POST" }, async (ctx) => {
        const token = readSetupToken(ctx.headers?.get("cookie") ?? undefined);
        // Reading the demo company's images is slow, so it happens before the lock.
        const startDemo = await prepareDemoStart();
        const owner = await refusingSetupConflicts(
          () => createDemoOwner(transact, ctx, token, startDemo),
          NOT_AT_IMPORT_STEP,
        );
        await setSessionCookie(ctx, owner);
        setSetupCookie(ctx, "", 0);
        return ctx.json({ user: { id: owner.user.id } });
      }),
    },
  } satisfies BetterAuthPlugin;
}

const DAY_SECONDS = 24 * 60 * 60;

async function assertHoldsSetup(orm: Orm, token: string | null): Promise<void> {
  if ((await readInstance(orm)).ownerUserId) {
    throw APIError.from("CONFLICT", OWNER_EXISTS);
  }
  if ((await readSetupHolder(orm, { token, now: new Date() })) !== "you") {
    throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
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
  const { internalAdapter } = ctx.context;
  return inAuthTransaction(transact, ctx, (tx) =>
    createOwnerAtSetup(SYSTEM, tx, { token, now: new Date() }, async () => {
      const user = await internalAdapter.createUser(
        { email, name: "", emailVerified: false },
        { method: "email-password" },
      );
      await linkPassword(ctx, user.id, passwordHash);
      return { user, session: await internalAdapter.createSession(user.id) };
    }),
  );
}

/**
 * Starts the demo with a provisional owner and their session, in one transaction. The
 * owner has no credentials, so only this session reaches the demo.
 */
function createDemoOwner(
  transact: Transact,
  ctx: GenericEndpointContext,
  token: string | null,
  startDemo: DemoStart,
) {
  const { internalAdapter } = ctx.context;
  const now = new Date();
  return inAuthTransaction(transact, ctx, (tx) =>
    startDemoAtSetup(
      SYSTEM,
      tx,
      { token, now },
      async () => {
        const user = await internalAdapter.createUser(
          { email: provisionalOwnerEmail(), name: "", emailVerified: false },
          { method: "anonymous" },
        );
        // The session ends with the demo; Better Auth would otherwise give it its usual length.
        const session = await internalAdapter.createSession(
          user.id,
          false,
          { expiresAt: demoExpiry(now) },
          true,
        );
        return { user, session };
      },
      startDemo,
    ),
  );
}

/** Answers the refusals of setup as HTTP conflicts; `stepConflict` names a wrong step. */
async function refusingSetupConflicts<T>(
  run: () => Promise<T>,
  stepConflict?: { code: string; message: string },
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw APIError.from("CONFLICT", OWNER_EXISTS);
    }
    if (error instanceof SetupInProgressError) {
      throw APIError.from("CONFLICT", SETUP_IN_PROGRESS);
    }
    if (stepConflict && error instanceof ApplicationError && error.code === "CONFLICT") {
      throw APIError.from("CONFLICT", stepConflict);
    }
    throw error;
  }
}
