/** A domain event that only tests publish, so core tests depend on no real module's events. */
declare module "../../src/core/events" {
  interface DomainEvents {
    "example.happened": { id: string };
  }
}

export const EXAMPLE_PAYLOAD = { id: "example-1" };
