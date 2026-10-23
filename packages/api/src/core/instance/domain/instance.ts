import { ApplicationError } from "../../applicationError";
import type { AiSource } from "./aiSource";
import type { ManagedAssignment } from "./managed";
import type { OwnerSignInMethod } from "./ownerSignInMethod";
import { OwnerExistsError, type SetupStep } from "./setup";
import { holdsSetup, SetupInProgressError, type SetupSession } from "./setupSession";

/** The stored facts needed to restore an instance; secrets are read separately. */
export interface InstanceState {
  ownerUserId: string | null;
  step: SetupStep;
  setupSession: SetupSession | null;
  demoExpiresAt: Date | null;
  aiSource: AiSource | null;
  assignment: ManagedAssignment | null;
  ownerSignInMethod: OwnerSignInMethod | null;
}

/** An immutable instance with its setup transitions and access rules; callers persist changes in a transaction. */
export class Instance {
  readonly #state: InstanceState;

  constructor(state: InstanceState) {
    this.#state = structuredClone(state);
  }

  get ownerUserId(): string | null {
    return this.#state.ownerUserId;
  }

  get step(): SetupStep {
    return this.#state.step;
  }

  get setupSession(): SetupSession | null {
    return structuredClone(this.#state.setupSession);
  }

  get demoExpiresAt(): Date | null {
    return structuredClone(this.#state.demoExpiresAt);
  }

  get aiSource(): AiSource | null {
    return this.#state.aiSource;
  }

  get assignment(): ManagedAssignment | null {
    return structuredClone(this.#state.assignment);
  }

  get ownerSignInMethod(): OwnerSignInMethod | null {
    return this.#state.ownerSignInMethod;
  }

  requireUnclaimedOwner(): void {
    if (this.ownerUserId) {
      throw new OwnerExistsError();
    }
  }

  /** Refuses a browser that does not hold live setup, including after an owner was claimed. */
  requireHeldSetup(token: string | null, now: Date): void {
    this.requireUnclaimedOwner();
    if (!this.#state.setupSession || !holdsSetup(this.#state.setupSession, token, now)) {
      throw new SetupInProgressError();
    }
  }

  claimOwner(userId: string): Instance {
    this.requireUnclaimedOwner();
    return new Instance({ ...this.#state, ownerUserId: userId });
  }

  /** Ends a live provisional owner's demo, clearing the owner, deadline and old setup session together. */
  exitDemo(userId: string, now: Date): Instance {
    if (
      this.ownerUserId !== userId ||
      !this.#state.demoExpiresAt ||
      now >= this.#state.demoExpiresAt
    ) {
      throw new ApplicationError("FORBIDDEN", "Only the demo's owner can reset setup.");
    }
    return new Instance({
      ...this.#state,
      ownerUserId: null,
      demoExpiresAt: null,
      setupSession: null,
      step: "company",
    });
  }

  completeCompanyStep(): Instance | null {
    return this.advanceStep("company", "import");
  }

  completeReadyStep(): Instance | null {
    return this.advanceStep("ready", "done");
  }

  completeOwnerStep(): Instance | null {
    return this.advanceStep("owner", "done");
  }

  reopenImportStep(): Instance | null {
    return this.advanceStep("owner", "import") ?? this.advanceStep("ready", "import");
  }

  returnToCompanyStep(): Instance | null {
    return this.advanceStep("done", "company");
  }

  completeImportStep(): Instance | null {
    return this.leaveImportStep("done");
  }

  approveImportStep(): Instance | null {
    return this.leaveImportStep("ready");
  }

  isImportOpen(): boolean {
    return this.step === "company" || this.step === "import";
  }

  canChooseExternalAgent(): boolean {
    return this.canUseExternalAgent() && this.step === "import";
  }

  /** The server command may choose the agent before anyone opens setup, while no AI choice is saved. */
  canChooseExternalAgentOnServer(): boolean {
    return this.canUseExternalAgent() && this.aiSource === null;
  }

  /** An installing agent may connect before setup is held; an existing setup session must still be live. */
  isSetupOpenToExternalAgent(now: Date): boolean {
    return (
      this.canUseExternalAgent() &&
      this.aiSource === "external_agent" &&
      (this.#state.setupSession === null || this.#state.setupSession.expiresAt > now)
    );
  }

  /** When this user loses provisional-owner access; null for any other user. */
  demoDeadlineOf(userId: string): Date | null {
    return this.ownerUserId === userId ? this.demoExpiresAt : null;
  }

  private canUseExternalAgent(): boolean {
    return this.#state.assignment === null && this.ownerUserId === null && this.isImportOpen();
  }

  private leaveImportStep(withOwner: SetupStep): Instance | null {
    const next = !this.ownerUserId ? "owner" : this.#state.assignment ? withOwner : "done";
    return this.advanceStep("import", next);
  }

  private advanceStep(from: SetupStep, to: SetupStep): Instance | null {
    return this.step === from ? new Instance({ ...this.#state, step: to }) : null;
  }
}
