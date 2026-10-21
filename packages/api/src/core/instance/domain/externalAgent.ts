import type { Instance } from "./instance";

/**
 * Whether setup may turn to the external agent: on a self-hosted instance, before the owner
 * exists, while people are gathered.
 */
export function canChooseExternalAgent({ assignment, ownerUserId, setupStep }: Instance): boolean {
  // An assigned instance is managed, and never sees the choice.
  return assignment === null && ownerUserId === null && setupStep === "import";
}

/**
 * Whether the external agent may work now: setup may turn to it, it is the chosen AI source, and
 * the setup session it works for is still live.
 */
export function isSetupOpenToExternalAgent(instance: Instance, now: Date): boolean {
  return (
    canChooseExternalAgent(instance) &&
    instance.aiSource === "external_agent" &&
    instance.setupSession !== null &&
    instance.setupSession.expiresAt > now
  );
}
