import { buildSchema, parse, validate } from "graphql";
import { expect, it } from "vitest";

import { singleMutationField } from "./single-mutation-field";

const schema = buildSchema(`
  type Query { first: String, second: String }
  type Mutation { absence: Absence, attendance: Absence }
  type Absence { request: Payload, cancel: Payload }
  type Payload { id: ID, note: String }
`);

it("accepts one namespaced operation with several payload fields", () => {
  const document = parse("mutation { absence { request { id note } } }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors).toEqual([]);
});

it("rejects two mutation root fields", () => {
  const document = parse("mutation { absence { request { id } } attendance { request { id } } }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("rejects a second mutation root field from a named fragment", () => {
  const document = parse(`
    mutation { absence { request { id } } ...OtherMutation }
    fragment OtherMutation on Mutation { attendance { request { id } } }
  `);

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("rejects a second mutation root field from an inline fragment", () => {
  const document = parse(`
    mutation { absence { request { id } } ... on Mutation { attendance { request { id } } } }
  `);

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("accepts a query with several root fields", () => {
  const document = parse("{ first second }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors).toEqual([]);
});

it("rejects two operations inside one mutation namespace", () => {
  const document = parse("mutation { absence { request cancel } }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("rejects a second operation from a named fragment inside the namespace", () => {
  const document = parse(`
    mutation { absence { request ...OtherOperation } }
    fragment OtherOperation on Absence { cancel }
  `);

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("rejects a second operation from an inline fragment inside the namespace", () => {
  const document = parse("mutation { absence { request ... on Absence { cancel } } }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("ignores __typename inside a mutation namespace", () => {
  const document = parse("mutation { absence { __typename request } }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors).toEqual([]);
});

it("ignores __typename at the mutation root", () => {
  const document = parse("mutation { __typename absence { request { id } } }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors).toEqual([]);
});

it("accepts one operation through a 40-level doubling fragment chain", () => {
  const fragments = Array.from(
    { length: 40 },
    (_, level) => `fragment F${level} on Mutation { ...F${level + 1} ...F${level + 1} }`,
  ).join("\n");
  const document = parse(`
    mutation { ...F0 }
    ${fragments}
    fragment F40 on Mutation { absence { request { id } } }
  `);

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors).toEqual([]);
}, 1_000);

it("rejects two operations through a 40-level doubling fragment chain", () => {
  const fragments = Array.from(
    { length: 40 },
    (_, level) => `fragment F${level} on Mutation { ...F${level + 1} ...F${level + 1} }`,
  ).join("\n");
  const document = parse(`
    mutation { ...F0 }
    ${fragments}
    fragment F40 on Mutation { absence { request cancel } }
  `);

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
}, 1_000);
