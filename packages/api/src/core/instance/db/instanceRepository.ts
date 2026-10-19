import { eq } from "drizzle-orm";

import { user } from "../../auth";
import { type Orm, ormOf, type Tx } from "../../db";
import type { AiSource, ManagedAssignment, SetupSession, SetupStep } from "../domain";
import { instance } from "./instanceTable";

/** The instance row in Postgres, through the pool or inside a transaction. */
export interface InstanceRepository {
  readStep(): Promise<SetupStep>;
  /** Null before setup. */
  readOwnerUserId(): Promise<string | null>;
  /** The owner's id and sign-in email, or null before an owner exists. */
  readOwner(): Promise<{ userId: string; email: string } | null>;
  /**
   * Reads the owner, step and setup session, locking the row until the transaction
   * ends, so concurrent claims and setup sessions run one after another.
   */
  lockSetup(): Promise<{
    ownerUserId: string | null;
    step: SetupStep;
    setupSession: SetupSession | null;
  }>;
  /** Null when nobody holds setup. */
  readSetupSession(): Promise<SetupSession | null>;
  saveSetupSession(session: SetupSession): Promise<void>;
  clearSetupSession(): Promise<void>;
  /** Null before a managed instance's init, and always on self-hosted instances. */
  readAssignment(): Promise<ManagedAssignment | null>;
  /** Locks the row until the transaction ends, so concurrent inits run one after another. */
  lockAssignment(): Promise<{ ownerUserId: string | null; assignment: ManagedAssignment | null }>;
  setAssignment(assignment: ManagedAssignment): Promise<void>;
  setOwner(userId: string, step: SetupStep): Promise<void>;
  /** Moves the step from `from` to `to`; does nothing at any other step. Returns whether it moved. */
  advanceStep(from: SetupStep, to: SetupStep): Promise<boolean>;
  /** The encrypted Broccoli AI token; null before the first one is issued. */
  readBroccoliAiToken(): Promise<string | null>;
  saveBroccoliAiToken(encryptedToken: string): Promise<void>;
  readAiSource(): Promise<{ source: AiSource | null; encryptedOpenRouterKey: string | null }>;
  /** Saves the source; a given key replaces the saved one, else it stays. */
  saveAiSource(source: AiSource, encryptedOpenRouterKey?: string): Promise<void>;
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

    lockSetup: async () => {
      const [row] = await orm()
        .select({ ownerUserId: instance.ownerUserId, step: instance.setupStep, ...sessionColumns })
        .from(instance)
        .for("update");
      if (!row) {
        throw new Error("The instance row is missing; migrations insert it");
      }
      return { ownerUserId: row.ownerUserId, step: row.step, setupSession: toSetupSession(row) };
    },

    readSetupSession: async (): Promise<SetupSession | null> => {
      const [row] = await orm().select(sessionColumns).from(instance);
      return row ? toSetupSession(row) : null;
    },

    saveSetupSession: async ({ tokenHash, expiresAt }: SetupSession): Promise<void> => {
      await orm().update(instance).set({ setupTokenHash: tokenHash, setupExpiresAt: expiresAt });
    },

    clearSetupSession: async (): Promise<void> => {
      await orm().update(instance).set({ setupTokenHash: null, setupExpiresAt: null });
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

    readBroccoliAiToken: async (): Promise<string | null> => {
      const [row] = await orm().select({ token: instance.encryptedBroccoliAiToken }).from(instance);
      return row?.token ?? null;
    },

    saveBroccoliAiToken: async (encryptedToken: string): Promise<void> => {
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

    saveAiSource: async (source: AiSource, encryptedOpenRouterKey?: string): Promise<void> => {
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
