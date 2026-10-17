/**
 * Where a new instance is in its first-run flow. Every instance starts at `company`;
 * a self-hosted one creates its owner at `owner`, after the import.
 */
export const SETUP_STEPS = ["company", "import", "owner", "done"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** An instance has one owner; a second claim is refused. */
export class OwnerExistsError extends Error {
  constructor() {
    super("The instance already has an owner");
    this.name = "OwnerExistsError";
  }
}
