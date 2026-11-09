import type { RecordTypeRegistration } from "../../src/core/records";

/** Record types used only by core history tests. */
declare module "../../src/core/records" {
  interface RecordTypes {
    example: true;
    other_example: true;
  }
}

declare module "../../src/core/security" {
  interface PermissionObjects {
    example: true;
  }
}

export const EXAMPLE_RECORD = {
  recordId: "example-1",
  changes: [{ field: "title", oldValue: null, newValue: "First" }],
};
export const EXAMPLE_REGISTRATION: RecordTypeRegistration = {
  graphqlType: "Example",
  permissions: { object: "example", editableFields: ["title"] },
  canonicalId: (recordId) => recordId.toLowerCase(),
  loadRecords: () => Promise.resolve(new Map()),
  subjectsOf: () => Promise.resolve(new Map()),
};

/** An example record readable only while its id is in the type's own allowlist. */
export const READABLE_EXAMPLE_REGISTRATION: RecordTypeRegistration = {
  graphqlType: "Example",
  canonicalId: (recordId) => recordId.toLowerCase(),
  loadRecords: () => Promise.resolve(new Map()),
  readableIds: (_ctx, ids) =>
    Promise.resolve(new Set(ids.filter((id) => id === EXAMPLE_RECORD.recordId))),
};
