import { lt } from "drizzle-orm";

import { isUniqueViolation, ormOf, type Tx } from "../../db";
import { managedTicket } from "./managedTicketTable";

/** Used tickets, inside the transaction that signs their user in. */
export interface ManagedTicketRepository {
  /** False when the ticket was used before; a concurrent use waits for the other to end. */
  consume(jti: string, expiresAt: Date): Promise<boolean>;
  deleteExpired(now: Date): Promise<void>;
}

export function managedTicketRepository(tx: Tx): ManagedTicketRepository {
  const orm = () => ormOf(tx);

  return {
    consume: async (jti: string, expiresAt: Date): Promise<boolean> => {
      try {
        await orm().insert(managedTicket).values({ jti, expiresAt });
        return true;
      } catch (error) {
        if (isUniqueViolation(error, "managed_ticket_pkey")) {
          return false;
        }
        throw error;
      }
    },

    deleteExpired: async (now: Date): Promise<void> => {
      await orm().delete(managedTicket).where(lt(managedTicket.expiresAt, now));
    },
  };
}
