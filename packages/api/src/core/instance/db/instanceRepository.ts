import { eq } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import type { ManagedAssignment, SetupStep } from "../domain";
import { instance } from "./instanceTable";

/** The instance row in Postgres, through the pool or inside a transaction. */
export interface InstanceRepository {
  readStep(): Promise<SetupStep>;
  /** Null before setup. */
  readOwnerUserId(): Promise<string | null>;
  /** The owner's id and sign-in email, or null before an owner exists. */
  readOwner(): Promise<{ userId: string; email: string } | null>;
  /** Locks the row until the transaction ends, so concurrent claims run one after another. */
  lockOwnerUserId(): Promise<string | null>;
  /** Null before a managed instance's init, and always on self-hosted instances. */
  readAssignment(): Promise<ManagedAssignment | null>;
  /** Locks the row until the transaction ends, so concurrent inits run one after another. */
  lockAssignment(): Promise<{ ownerUserId: string | null; assignment: ManagedAssignment | null }>;
  setAssignment(assignment: ManagedAssignment): Promise<void>;
  setOwner(userId: string, step: SetupStep): Promise<void>;
  /** Moves the step from `from` to `to`; does nothing at any other step. Returns whether it moved. */
  advanceStep(from: SetupStep, to: SetupStep): Promise<boolean>;
}

export function instanceRepository(db: Orm | Tx): InstanceRepository {
  const orm = () => ormOf(db);

  return {
    readStep: async (): Promise<SetupStep> => {
      const [row] = await orm().select({ step: instance.setupStep }).from(instance);
      if (!row) {
        throw new Error("The instance row is missing; migrations insert it");
      }
      return row.step;
    },

    readOwnerUserId: async (): Promise<string | null> => {
      const [row] = await orm().select({ ownerUserId: instance.ownerUserId }).from(instance);
      return row?.ownerUserId ?? null;
    },

    readOwner: async (): Promise<{ userId: string; email: string } | null> => {
      const [row] = await orm()
        .select({ userId: user.id, email: user.email })
        .from(instance)
        .innerJoin(user, eq(user.id, instance.ownerUserId));
      return row ?? null;
    },

    lockOwnerUserId: async (): Promise<string | null> => {
      const [row] = await orm()
        .select({ ownerUserId: instance.ownerUserId })
        .from(instance)
        .for("update");
      if (!row) {
        throw new Error("The instance row is missing; migrations insert it");
      }
      return row.ownerUserId;
    },

    readAssignment: async (): Promise<ManagedAssignment | null> => {
      const [row] = await orm().select(assignmentColumns).from(instance);
      return row ? toAssignment(row) : null;
    },

    lockAssignment: async (): Promise<{
      ownerUserId: string | null;
      assignment: ManagedAssignment | null;
    }> => {
      const [row] = await orm().select(assignmentColumns).from(instance).for("update");
      if (!row) {
        throw new Error("The instance row is missing; migrations insert it");
      }
      return { ownerUserId: row.ownerUserId, assignment: toAssignment(row) };
    },

    setAssignment: async ({
      companyId,
      publicOrigin,
      websiteOrigin,
    }: ManagedAssignment): Promise<void> => {
      await orm().update(instance).set({
        managedCompanyId: companyId,
        managedPublicOrigin: publicOrigin,
        managedWebsiteOrigin: websiteOrigin,
      });
    },

    setOwner: async (userId: string, step: SetupStep): Promise<void> => {
      await orm().update(instance).set({ ownerUserId: userId, setupStep: step });
    },

    advanceStep: async (from: SetupStep, to: SetupStep): Promise<boolean> => {
      const result = await orm()
        .update(instance)
        .set({ setupStep: to })
        .where(eq(instance.setupStep, from));
      return (result.rowCount ?? 0) > 0;
    },
  };
}

const assignmentColumns = {
  ownerUserId: instance.ownerUserId,
  companyId: instance.managedCompanyId,
  publicOrigin: instance.managedPublicOrigin,
  websiteOrigin: instance.managedWebsiteOrigin,
};

function toAssignment({
  companyId,
  publicOrigin,
  websiteOrigin,
}: {
  companyId: string | null;
  publicOrigin: string | null;
  websiteOrigin: string | null;
}): ManagedAssignment | null {
  // A check constraint keeps the three columns all null or all set.
  return companyId && publicOrigin && websiteOrigin
    ? { companyId, publicOrigin, websiteOrigin }
    : null;
}
