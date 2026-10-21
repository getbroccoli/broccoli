import type { AiSource } from "./aiSource";
import type { ManagedAssignment } from "./managed";
import type { SetupStep } from "./setup";
import type { SetupSession } from "./setupSession";

/** The one row describing this installation, as stored. */
export interface Instance {
  /** Null before setup. */
  ownerUserId: string | null;
  setupStep: SetupStep;
  /** Null when nobody holds setup. */
  setupSession: SetupSession | null;
  /** When the provisional owner's demo ends; null without one. */
  demoExpiresAt: Date | null;
  /** Null before a managed instance's init, and always on self-hosted instances. */
  assignment: ManagedAssignment | null;
  /** Null until the owner chooses. */
  aiSource: AiSource | null;
  encryptedOpenRouterKey: string | null;
  /** The legacy Broccoli AI token, moved to the data folder on first use. */
  encryptedBroccoliAiToken: string | null;
}
