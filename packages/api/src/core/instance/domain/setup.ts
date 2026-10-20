/**
 * Where a new instance is in its first-run flow. Every instance starts at `company`;
 * after the import a self-hosted one creates its owner at `owner`, and a managed owner
 * sees what setup added at `ready`.
 */
export const SETUP_STEPS = ["company", "import", "owner", "ready", "done"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** An instance has one owner; a second claim is refused. */
export class OwnerExistsError extends Error {
  constructor() {
    super("The instance already has an owner");
    this.name = "OwnerExistsError";
  }
}
