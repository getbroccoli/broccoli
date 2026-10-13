/** Where a new instance is in its first-run flow, in order. */
export const SETUP_STEPS = ["owner", "company", "import", "done"] as const;

export type SetupStep = (typeof SETUP_STEPS)[number];

/** An instance has one owner; a second claim is refused. */
export class OwnerExistsError extends Error {
  constructor() {
    super("The instance already has an owner");
    this.name = "OwnerExistsError";
  }
}
