import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import {
  createManagedInstanceService,
  createOwnerService,
  createInstanceService,
  OwnerExistsError,
  type OwnerSignInMethod,
} from "../../instance";
import { managedAccountRepository, managedTicketRepository } from "../db";
import type { ManagedTicket } from "../domain";

const managedInstance = createManagedInstanceService();
const owners = createOwnerService();
const instances = createInstanceService();

/** A valid ticket that may not sign in here: used before, expired, or for someone else. */
export class SignInRefusedError extends Error {
  constructor() {
    super("The ticket cannot sign in here");
    this.name = "SignInRefusedError";
  }
}

/** Managed sign-in with a ticket from the accounts service. */
export interface ManagedSignInService {
  /**
   * Uses the ticket once and returns the user it signs in: the owner it creates on a new
   * instance, or the owner whose subject it names. Stores the owner's sign-in method the
   * first time a ticket names it. Runs in the transaction that creates the session, so a
   * failure leaves the ticket unused.
   */
  signInWithTicket(
    ctx: SecurityContext,
    tx: Tx,
    ticket: ManagedTicket,
    clock: () => Date,
  ): Promise<{ userId: string }>;
}

export function createManagedSignInService(): ManagedSignInService {
  return {
    async signInWithTicket(ctx, tx, ticket, clock) {
      ctx.requireSystem();
      const tickets = managedTicketRepository(tx);
      if (!(await tickets.consume(ticket.jti, ticket.expiresAt))) {
        throw new SignInRefusedError();
      }
      await tickets.deleteExpired(clock());
      const userId = await findOrClaimOwner(ctx, tx, ticket);
      if (ticket.method) {
        await managedInstance.recordOwnerSignInMethod(ctx, tx, SIGN_IN_METHODS[ticket.method]);
      }
      // Checked last, with a fresh clock: the steps above may have waited for other transactions.
      if (ticket.expiresAt <= clock()) {
        throw new SignInRefusedError();
      }
      return { userId };
    },
  };
}

async function findOrClaimOwner(
  ctx: SecurityContext,
  tx: Tx,
  ticket: ManagedTicket,
): Promise<string> {
  const userId = await managedAccountRepository(tx).findUserId(ticket.subject);
  if (!userId) {
    return claimOwnerFor(ctx, tx, ticket);
  }
  // Only the owner exists until invitations do.
  if (userId !== (await instances.readInstance(tx)).ownerUserId) {
    throw new SignInRefusedError();
  }
  return userId;
}

async function claimOwnerFor(ctx: SecurityContext, tx: Tx, ticket: ManagedTicket): Promise<string> {
  const accounts = managedAccountRepository(tx);
  try {
    const owner = await owners.claimOwner(ctx, tx, async () => ({
      user: await accounts.createUser(ticket),
    }));
    return owner.user.id;
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw new SignInRefusedError();
    }
    throw error;
  }
}

const SIGN_IN_METHODS: Record<"google" | "email", OwnerSignInMethod> = {
  google: "sign_in_with_google",
  email: "sign_in_with_email",
};
