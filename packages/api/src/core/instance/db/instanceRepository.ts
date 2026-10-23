import { eq, isNull } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import {
  type AiSource,
  Instance,
  type ManagedAssignment,
  type OwnerSignInMethod,
  type SetupSession,
  type SetupStep,
} from "../domain";
import { instance } from "./instanceTable";

/** The instance row in Postgres, through the pool or inside a transaction. */
export interface InstanceRepository {
  /** The whole instance row in one read. */
  readInstance(): Promise<Instance>;
  /** As `readInstance`, locking the row until the transaction ends. */
  lockInstance(): Promise<Instance>;
  /** The owner's id and sign-in email, or null before an owner exists. */
  readOwner(): Promise<{ userId: string; email: string } | null>;
  saveSetupSession(session: SetupSession): Promise<void>;
  clearSetupSession(): Promise<void>;
  saveDemoExpiresAt(expiresAt: Date | null): Promise<void>;
  setAssignment(assignment: ManagedAssignment): Promise<void>;
  setOwner(userId: string, step: SetupStep): Promise<void>;
  /** Stores the owner's sign-in method unless one is stored already. */
  saveOwnerSignInMethod(method: OwnerSignInMethod): Promise<void>;
  /** Removes the owner and moves setup to `step`. */
  clearOwner(step: SetupStep): Promise<void>;
  /** Moves the step from `from` to `to`; does nothing at any other step. Returns whether it moved. */
  advanceStep(from: SetupStep, to: SetupStep): Promise<boolean>;
  /** The encrypted Broccoli AI token; null before the first one is issued. */
  readBroccoliAiToken(): Promise<string | null>;
  saveBroccoliAiToken(encryptedToken: string | null): Promise<void>;
  readAiSource(): Promise<{ source: AiSource | null; encryptedOpenRouterKey: string | null }>;
  /** Saves the source; a given key replaces the saved one, else it stays. */
  storeAiSource(source: AiSource, encryptedOpenRouterKey?: string): Promise<void>;
}

export function instanceRepository(db: Orm | Tx): InstanceRepository {
  const orm = () => ormOf(db);

  const selectInstance = () =>
    orm()
      .select({
        step: instance.setupStep,
        demoExpiresAt: instance.demoExpiresAt,
        aiSource: instance.aiSource,
        ownerSignInMethod: instance.ownerSignInMethod,
        ...sessionColumns,
        // With the owner's id.
        ...assignmentColumns,
      })
      .from(instance);

  return {
    readInstance: async () => toInstance(await selectInstance()),

    lockInstance: async () => toInstance(await selectInstance().for("update")),

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

    saveOwnerSignInMethod: async (method: OwnerSignInMethod): Promise<void> => {
      await orm()
        .update(instance)
        .set({ ownerSignInMethod: method })
        .where(isNull(instance.ownerSignInMethod));
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

    readBroccoliAiToken: async (): Promise<string | null> => {
      const [row] = await orm().select({ token: instance.encryptedBroccoliAiToken }).from(instance);
      return row?.token ?? null;
    },

    saveBroccoliAiToken: async (encryptedToken: string | null): Promise<void> => {
      await orm().update(instance).set({ encryptedBroccoliAiToken: encryptedToken });
    },

    readAiSource: async () => {
      const [row] = await orm()
        .select({
          source: instance.aiSource,
          encryptedOpenRouterKey: instance.encryptedOpenRouterKey,
        })
        .from(instance);
      return row ?? { source: null, encryptedOpenRouterKey: null };
    },

    storeAiSource: async (source: AiSource, encryptedOpenRouterKey?: string): Promise<void> => {
      await orm().update(instance).set({ aiSource: source, encryptedOpenRouterKey });
    },
  };
}

const assignmentColumns = {
  ownerUserId: instance.ownerUserId,
  companyId: instance.managedCompanyId,
  publicOrigin: instance.managedPublicOrigin,
  websiteOrigin: instance.managedWebsiteOrigin,
};

const sessionColumns = {
  tokenHash: instance.setupTokenHash,
  expiresAt: instance.setupExpiresAt,
};

function toSetupSession({
  tokenHash,
  expiresAt,
}: {
  tokenHash: string | null;
  expiresAt: Date | null;
}): SetupSession | null {
  // A check constraint keeps both columns null or both set.
  return tokenHash && expiresAt ? { tokenHash, expiresAt } : null;
}

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

function toInstance([row]: {
  ownerUserId: string | null;
  step: SetupStep;
  demoExpiresAt: Date | null;
  aiSource: AiSource | null;
  ownerSignInMethod: OwnerSignInMethod | null;
  tokenHash: string | null;
  expiresAt: Date | null;
  companyId: string | null;
  publicOrigin: string | null;
  websiteOrigin: string | null;
}[]): Instance {
  if (!row) {
    throw new Error("The instance row is missing; migrations insert it");
  }
  return new Instance({
    ownerUserId: row.ownerUserId,
    step: row.step,
    setupSession: toSetupSession(row),
    demoExpiresAt: row.demoExpiresAt,
    aiSource: row.aiSource,
    assignment: toAssignment(row),
    ownerSignInMethod: row.ownerSignInMethod,
  });
}
