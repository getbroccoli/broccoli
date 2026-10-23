import type { Instance } from "./instance";

/**
 * Whether setup may turn to the external agent: on a self-hosted instance, before the owner
 * exists, while people are gathered.
 */
export function canChooseExternalAgent({ assignment, ownerUserId, step }: Instance): boolean {
  // An assigned instance is managed, and never sees the choice.
  return assignment === null && ownerUserId === null && step === "import";
}

/**
 * Whether the command on the server may choose the external agent for the owner: on a
 * self-hosted instance before the owner exists, before people are gathered, while no AI source is saved.
 */
export function canChooseExternalAgentOnServer({
  assignment,
  ownerUserId,
  step,
  aiSource,
}: Instance): boolean {
  return (
    assignment === null &&
    ownerUserId === null &&
    (step === "company" || step === "import") &&
    aiSource === null
  );
}

/**
 * Whether the external agent may work now: on a self-hosted instance before the owner exists and
 * before people are reviewed, it is the chosen AI source, and setup is unheld or its session live.
 * Unheld lets an agent that installed Broccoli connect before anyone opens it.
 */
export function isSetupOpenToExternalAgent(
  { assignment, ownerUserId, step, aiSource, setupSession }: Instance,
  now: Date,
): boolean {
  return (
    assignment === null &&
    ownerUserId === null &&
    (step === "company" || step === "import") &&
    aiSource === "external_agent" &&
    (setupSession === null || setupSession.expiresAt > now)
  );
}
