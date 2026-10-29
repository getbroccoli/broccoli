import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { user } from "../../../core/auth";
import { type Orm, ormOf, type Tx } from "../../../core/db";
import type { Employee, Invite } from "../domain";
import { EMPLOYEE_COLUMNS } from "./employeeRepository";
import { employees } from "./employeesTable";
import { invites } from "./invitesTable";

export type NewInvite = Omit<
  Invite,
  "id" | "createdAt" | "sendFailedAt" | "acceptedAt" | "cancelledAt" | "replacedAt"
>;

/** Invites stored in Postgres, through the pool or inside a transaction. */
export interface InviteRepository {
  /** Replaces the employee's open invite, if any, with a new one. */
  replace(invite: NewInvite, now: Date): Promise<Invite>;
  /** The open invites of these employees, expired ones included. */
  findOpen(employeeIds: readonly string[]): Promise<Invite[]>;
  /** The open invite whose token has this hash; null when there is none. */
  findOpenByTokenHash(tokenHash: string): Promise<Invite | null>;
  /** Like `findOpenByTokenHash`, holding the row until the caller commits, so one link joins once. */
  lockOpenByTokenHash(tokenHash: string): Promise<Invite | null>;
  findById(id: string): Promise<Invite | null>;
  /** Closes the employee's open invite as cancelled; null when none was open. */
  cancelOpen(employeeId: string, now: Date): Promise<Invite | null>;
  markAccepted(id: string, now: Date): Promise<void>;
  markSendFailed(id: string, now: Date): Promise<void>;
  /** These employees, with what decides whether they can be invited; unknown ids are left out. */
  findInvitees(employeeIds: readonly string[]): Promise<Invitee[]>;
  /** The inviter's name, from the employee they sign in as or else their user, and email; null without the user. */
  findInviter(userId: string): Promise<{ name: string | null; email: string } | null>;
}

/** An employee as an invite sees them. */
export interface Invitee {
  employee: Employee;
  /** Part of the sample company, which nobody signs in as. */
  isDemo: boolean;
  /** Whether a user already signs in with the employee's email. */
  emailHasAccount: boolean;
}

export function inviteRepository(db: Orm | Tx): InviteRepository {
  const orm = () => ormOf(db);
  const open = and(
    isNull(invites.acceptedAt),
    isNull(invites.cancelledAt),
    isNull(invites.replacedAt),
  );

  return {
    replace: async (newInvite, now) => {
      await orm()
        .update(invites)
        .set({ replacedAt: now })
        .where(and(eq(invites.employeeId, newInvite.employeeId), open));
      const [invite] = await orm().insert(invites).values(newInvite).returning();
      return invite!;
    },

    findOpen: (employeeIds) =>
      orm()
        .select()
        .from(invites)
        .where(and(inArray(invites.employeeId, [...employeeIds]), open)),

    findOpenByTokenHash: async (tokenHash) => {
      const [invite] = await orm()
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, tokenHash), open));
      return invite ?? null;
    },

    lockOpenByTokenHash: async (tokenHash) => {
      const [invite] = await orm()
        .select()
        .from(invites)
        .where(and(eq(invites.tokenHash, tokenHash), open))
        .for("update");
      return invite ?? null;
    },

    findById: async (id) => {
      const [invite] = await orm().select().from(invites).where(eq(invites.id, id));
      return invite ?? null;
    },

    cancelOpen: async (employeeId, now) => {
      const [invite] = await orm()
        .update(invites)
        .set({ cancelledAt: now })
        .where(and(eq(invites.employeeId, employeeId), open))
        .returning();
      return invite ?? null;
    },

    markAccepted: async (id, now) => {
      await orm().update(invites).set({ acceptedAt: now }).where(eq(invites.id, id));
    },

    markSendFailed: async (id, now) => {
      await orm().update(invites).set({ sendFailedAt: now }).where(eq(invites.id, id));
    },

    findInvitees: async (employeeIds) => {
      const { isDemo, ...employeeColumns } = EMPLOYEE_COLUMNS;
      return (
        orm()
          .select({
            employee: employeeColumns,
            isDemo,
            emailHasAccount: sql<boolean>`${user.id} is not null`,
          })
          .from(employees)
          // Better Auth stores emails lowercased.
          .leftJoin(user, eq(user.email, sql`lower(${employees.email})`))
          .where(inArray(employees.id, [...employeeIds]))
      );
    },

    findInviter: async (userId) => {
      const [row] = await orm()
        .select({
          userName: user.name,
          email: user.email,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(user)
        .leftJoin(employees, eq(employees.userId, user.id))
        .where(eq(user.id, userId));
      if (!row) {
        return null;
      }
      const name = row.firstName ? `${row.firstName} ${row.lastName}` : row.userName.trim();
      return { name: name || null, email: row.email };
    },
  };
}
