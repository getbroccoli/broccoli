import type { AiSource } from "./aiSource";
import type { ManagedAssignment } from "./managed";
import type { SetupStep } from "./setup";
import type { SetupSession } from "./setupSession";

/** The instance row as one fact: its owner, setup, AI choice and managed assignment. */
export interface Instance {
  /** Null before setup creates the owner. */
  ownerUserId: string | null;
  step: SetupStep;
  /** Null when nobody holds setup. */
  setupSession: SetupSession | null;
  /** When the provisional owner's demo ends; null without one. */
  demoExpiresAt: Date | null;
  aiSource: AiSource | null;
  /** Null on a self-hosted instance, and on a managed one before its init. */
  assignment: ManagedAssignment | null;
}
