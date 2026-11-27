import { and, eq, isNull } from "drizzle-orm";

import { session } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";

/** Whom a browser session acts as, kept on Better Auth's session row so it ends with the session. */
export interface ActingSessionRepository {
  /** Makes a session acting as nobody act as the employee; false when it acts as someone already. */
  startActing(sessionId: string, employeeId: string): Promise<boolean>;
  /** Makes the session act as its own user again; nothing when it does already. */
  stopActing(sessionId: string): Promise<void>;
  /** Stops acting as this employee only, so a later start in the same session stays. */
  stopActingAs(sessionId: string, employeeId: string): Promise<void>;
}

export function actingSessionRepository(db: Orm | Tx): ActingSessionRepository {
  const orm = () => ormOf(db);
  return {
    startActing: async (sessionId, employeeId) => {
      const started = await orm()
        .update(session)
        .set({ actingAsEmployeeId: employeeId })
        .where(and(eq(session.id, sessionId), isNull(session.actingAsEmployeeId)))
        .returning({ id: session.id });
      return started.length > 0;
    },
    stopActing: async (sessionId) => {
      await orm()
        .update(session)
        .set({ actingAsEmployeeId: null })
        .where(eq(session.id, sessionId));
    },
    stopActingAs: async (sessionId, employeeId) => {
      await orm()
        .update(session)
        .set({ actingAsEmployeeId: null })
        .where(and(eq(session.id, sessionId), eq(session.actingAsEmployeeId, employeeId)));
    },
  };
}
