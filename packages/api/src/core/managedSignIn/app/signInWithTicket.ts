import type { Tx } from "../../db";
import { claimOwner, OwnerExistsError, readOwnerUserId } from "../../instance";
import { managedAccountRepository, managedTicketRepository } from "../db";
import type { ManagedTicket } from "../domain";

/** A valid ticket that may not sign in here: used before, expired, or for someone else. */
export class SignInRefusedError extends Error {
  constructor() {
    super("The ticket cannot sign in here");
    this.name = "SignInRefusedError";
  }
}

/**
 * Uses the ticket once and returns the user it signs in: the owner it creates on a new
 * instance, or the owner whose subject it names. Runs in the transaction that creates
 * the session, so a failure leaves the ticket unused.
 */
export async function signInWithTicket(
  tx: Tx,
  ticket: ManagedTicket,
  now: Date,
): Promise<{ userId: string }> {
  const tickets = managedTicketRepository(tx);
  if (!(await tickets.consume(ticket.jti, ticket.expiresAt))) {
    throw new SignInRefusedError();
  }
  // Checked after `consume`, which may have waited for a concurrent use of the ticket.
  if (ticket.expiresAt <= now) {
    throw new SignInRefusedError();
  }
  await tickets.deleteExpired(now);

  const accounts = managedAccountRepository(tx);
  const userId = await accounts.findUserId(ticket.subject);
  if (userId) {
    // Only the owner exists until invitations do.
    if (userId !== (await readOwnerUserId(tx))) {
      throw new SignInRefusedError();
    }
    return { userId };
  }
  return { userId: await claimOwnerFor(tx, ticket) };
}

async function claimOwnerFor(tx: Tx, ticket: ManagedTicket): Promise<string> {
  const accounts = managedAccountRepository(tx);
  try {
    const owner = await claimOwner(tx, async () => ({ user: await accounts.createUser(ticket) }));
    return owner.user.id;
  } catch (error) {
    if (error instanceof OwnerExistsError) {
      throw new SignInRefusedError();
    }
    throw error;
  }
}
