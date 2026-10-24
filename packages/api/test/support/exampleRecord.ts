import type { RecordTypeRegistration } from "../../src/core/records";

/** Record types used only by core history tests. */
declare module "../../src/core/records" {
  interface RecordTypes {
    example: true;
    other_example: true;
  }
}

export const EXAMPLE_RECORD = {
  recordId: "example-1",
  changes: [{ field: "title", oldValue: null, newValue: "First" }],
};
export const EXAMPLE_REGISTRATION: RecordTypeRegistration = {
  graphqlType: "Example",
  requireHistoryAccess: (ctx) => ctx.requireOwnerOrSystem(),
  canonicalId: (recordId) => recordId.toLowerCase(),
  loadRecords: () => Promise.resolve(new Map()),
};
