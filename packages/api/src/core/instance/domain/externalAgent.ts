import type { AiSource } from "./aiSource";
import type { SetupStep } from "./setup";
import type { SetupSession } from "./setupSession";

/** The instance facts that decide whether the owner's external agent may work. */
export interface AgentSetupFacts {
  /** Whether orchestration assigned the instance: a managed one, which never sees the choice. */
  isManaged: boolean;
  ownerUserId: string | null;
  step: SetupStep;
  setupSession: SetupSession | null;
  aiSource: AiSource | null;
}

/**
 * Whether setup may turn to the external agent: on a self-hosted instance, before the owner
 * exists, while people are gathered.
 */
export function canChooseAgent({ isManaged, ownerUserId, step }: AgentSetupFacts): boolean {
  return !isManaged && ownerUserId === null && step === "import";
}

/**
 * Whether the external agent may work now: setup may turn to it, it is the chosen AI source, and
 * the setup session it works for is still live.
 */
export function isSetupOpenToAgent(facts: AgentSetupFacts, now: Date): boolean {
  return (
    canChooseAgent(facts) &&
    facts.aiSource === "agent" &&
    facts.setupSession !== null &&
    facts.setupSession.expiresAt > now
  );
}
