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
