import { eq } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import type { AiSource, Instance, ManagedAssignment, SetupSession, SetupStep } from "../domain";
import { instance } from "./instanceTable";

/** The instance row in Postgres, through the pool or inside a transaction. */
export interface InstanceRepository {
  read(): Promise<Instance>;
  /**
   * Reads the instance and locks its row until the transaction ends, so concurrent claims,
   * setup sessions and inits run one after another.
   */
  lock(): Promise<Instance>;
  /** The owner's id and sign-in email, or null before an owner exists. */
  readOwner(): Promise<{ userId: string; email: string } | null>;
  saveSetupSession(session: SetupSession): Promise<void>;
  clearSetupSession(): Promise<void>;
  saveDemoExpiresAt(expiresAt: Date | null): Promise<void>;
  setAssignment(assignment: ManagedAssignment): Promise<void>;
  setOwner(userId: string, step: SetupStep): Promise<void>;
  /** Removes the owner and moves setup to `step`. */
  clearOwner(step: SetupStep): Promise<void>;
  /** Moves the step from `from` to `to`; does nothing at any other step. Returns whether it moved. */
  advanceStep(from: SetupStep, to: SetupStep): Promise<boolean>;
  saveBroccoliAiToken(encryptedToken: string | null): Promise<void>;
  /** Saves the source; a given key replaces the saved one, else it stays. */
  storeAiSource(source: AiSource, encryptedOpenRouterKey?: string): Promise<void>;
}

export function instanceRepository(db: Orm | Tx): InstanceRepository {
  const orm = () => ormOf(db);

  return {
    read: async (): Promise<Instance> => {
      const [row] = await orm().select().from(instance);
      return toInstance(row);
    },

    lock: async (): Promise<Instance> => {
      const [row] = await orm().select().from(instance).for("update");
      return toInstance(row);
    },

    readOwner: async (): Promise<{ userId: string; email: string } | null> => {
      const [row] = await orm()
        .select({ userId: user.id, email: user.email })
        .from(instance)
        .innerJoin(user, eq(user.id, instance.ownerUserId));
      return row ?? null;
    },

    saveSetupSession: async ({ tokenHash, expiresAt }: SetupSession): Promise<void> => {
      await orm().update(instance).set({ setupTokenHash: tokenHash, setupExpiresAt: expiresAt });
    },

    clearSetupSession: async (): Promise<void> => {
      await orm().update(instance).set({ setupTokenHash: null, setupExpiresAt: null });
    },

    saveDemoExpiresAt: async (expiresAt: Date | null): Promise<void> => {
      await orm().update(instance).set({ demoExpiresAt: expiresAt });
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

    clearOwner: async (step: SetupStep): Promise<void> => {
      await orm().update(instance).set({ ownerUserId: null, setupStep: step });
    },

    advanceStep: async (from: SetupStep, to: SetupStep): Promise<boolean> => {
      const result = await orm()
        .update(instance)
        .set({ setupStep: to })
        .where(eq(instance.setupStep, from));
      return (result.rowCount ?? 0) > 0;
    },

    saveBroccoliAiToken: async (encryptedToken: string | null): Promise<void> => {
      await orm().update(instance).set({ encryptedBroccoliAiToken: encryptedToken });
    },

    storeAiSource: async (source: AiSource, encryptedOpenRouterKey?: string): Promise<void> => {
      await orm().update(instance).set({ aiSource: source, encryptedOpenRouterKey });
    },
  };
}

function toInstance(row: typeof instance.$inferSelect | undefined): Instance {
  if (!row) {
    throw new Error("The instance row is missing; migrations insert it");
  }
  return {
    ownerUserId: row.ownerUserId,
    setupStep: row.setupStep,
    setupSession: toSetupSession(row),
    demoExpiresAt: row.demoExpiresAt,
    assignment: toAssignment(row),
    aiSource: row.aiSource,
    encryptedOpenRouterKey: row.encryptedOpenRouterKey,
    encryptedBroccoliAiToken: row.encryptedBroccoliAiToken,
  };
}

function toSetupSession({
  setupTokenHash: tokenHash,
  setupExpiresAt: expiresAt,
}: typeof instance.$inferSelect): SetupSession | null {
  // A check constraint keeps both columns null or both set.
  return tokenHash && expiresAt ? { tokenHash, expiresAt } : null;
}

function toAssignment({
  managedCompanyId: companyId,
  managedPublicOrigin: publicOrigin,
  managedWebsiteOrigin: websiteOrigin,
}: typeof instance.$inferSelect): ManagedAssignment | null {
  // A check constraint keeps the three columns all null or all set.
  return companyId && publicOrigin && websiteOrigin
    ? { companyId, publicOrigin, websiteOrigin }
    : null;
}
