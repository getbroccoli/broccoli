/** A job used only by core tests, independent of any business module. */
declare module "../../src/core/jobs" {
  interface Jobs {
    "example.ran": { id: string };
  }
}

export const EXAMPLE_JOB = { id: "example-1" };
