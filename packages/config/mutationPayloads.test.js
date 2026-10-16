import { buildSchema } from "graphql";
import { expect, it } from "vitest";

import { mutationPayloadProblems } from "./mutationPayloads.js";

it("accepts payloads with an error union and without an error field", () => {
  const schema = buildSchema(`
    type Query { ping: String }
    type Mutation { import: ImportMutations! }
    type ImportMutations { approve: ImportApprovePayload!, skip: ImportPayload! }
    type Import { id: ID! }
    type ImportPayload { import: Import }
    type ImportApprovePayload { import: Import, error: ImportApproveError }
    union ImportApproveError = ConflictError
    interface Error { message: String! }
    type ConflictError implements Error { message: String! }
  `);

  expect(mutationPayloadProblems(schema)).toEqual([]);
});

it("rejects a bare mutation return type", () => {
  const schema = buildSchema(`
    type Query { ping: String }
    type Mutation { import: ImportMutations! }
    type ImportMutations { approve: Import! }
    type Import { id: ID! }
  `);

  expect(mutationPayloadProblems(schema).map(({ message }) => message)).toEqual([
    "ImportMutations.approve must return a non-null object type named …Payload.",
  ]);
});

it("rejects a nullable mutation payload", () => {
  const schema = buildSchema(`
    type Query { ping: String }
    type Mutation { import: ImportMutations! }
    type ImportMutations { approve: ImportApprovePayload }
    type ImportApprovePayload { id: ID }
  `);

  expect(mutationPayloadProblems(schema).map(({ message }) => message)).toEqual([
    "ImportMutations.approve must return a non-null object type named …Payload.",
  ]);
});

it("rejects a non-null payload error", () => {
  const schema = buildSchema(`
    type Query { ping: String }
    type Mutation { import: ImportMutations! }
    type ImportMutations { approve: ImportApprovePayload! }
    type ImportApprovePayload { error: ImportApproveError! }
    union ImportApproveError = ConflictError
    interface Error { message: String! }
    type ConflictError implements Error { message: String! }
  `);

  expect(mutationPayloadProblems(schema).map(({ message }) => message)).toEqual([
    "ImportApprovePayload.error must be a nullable union of Error types.",
  ]);
});

it("rejects a payload error typed as an object instead of a union", () => {
  const schema = buildSchema(`
    type Query { ping: String }
    type Mutation { import: ImportMutations! }
    type ImportMutations { approve: ImportApprovePayload! }
    type ImportApprovePayload { error: ConflictError }
    interface Error { message: String! }
    type ConflictError implements Error { message: String! }
  `);

  expect(mutationPayloadProblems(schema).map(({ message }) => message)).toEqual([
    "ImportApprovePayload.error must be a nullable union of Error types.",
  ]);
});
