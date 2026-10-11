import { eq } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import type { SetupStep } from "../domain";
import { instance } from "./instance-table";

export type InstanceRepository = ReturnType<typeof instanceRepository>;

/** The instance row in Postgres, through the pool or inside a transaction. */
export function instanceRepository(db: Orm | Tx) {
  const orm = () => ormOf(db);

  return {
    readStep: async (): Promise<SetupStep> => {
      const [row] = await orm().select({ step: instance.setupStep }).from(instance);
      if (!row) {
        throw new Error("The instance row is missing; migrations insert it");
      }
      return row.step;
    },

    /** Null before setup. */
    readOwnerUserId: async (): Promise<string | null> => {
      const [row] = await orm().select({ ownerUserId: instance.ownerUserId }).from(instance);
      return row?.ownerUserId ?? null;
    },

    /** The owner's id and sign-in email, or null before an owner exists. */
    readOwner: async (): Promise<{ userId: string; email: string } | null> => {
      const [row] = await orm()
        .select({ userId: user.id, email: user.email })
        .from(instance)
        .innerJoin(user, eq(user.id, instance.ownerUserId));
      return row ?? null;
    },

    /** Locks the row until the transaction ends, so concurrent claims run one after another. */
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

    setOwner: async (userId: string, step: SetupStep): Promise<void> => {
      await orm().update(instance).set({ ownerUserId: userId, setupStep: step });
    },

    /** Moves the step from `from` to `to`; does nothing at any other step. */
    advanceStep: async (from: SetupStep, to: SetupStep): Promise<void> => {
      await orm().update(instance).set({ setupStep: to }).where(eq(instance.setupStep, from));
    },
  };
}
