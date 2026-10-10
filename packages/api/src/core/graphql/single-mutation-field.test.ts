import { buildSchema, parse, validate } from "graphql";
import { expect, it } from "vitest";

import { singleMutationField } from "./single-mutation-field";

const schema = buildSchema(`
  type Query { first: String, second: String }
  type Mutation { first: String, second: String }
`);

it("accepts one mutation root field", () => {
  const document = parse("mutation { first }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors).toEqual([]);
});

it("rejects two mutation root fields", () => {
  const document = parse("mutation { first second }");

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("rejects a second mutation root field from a named fragment", () => {
  const document = parse(`
    mutation { first ...OtherMutation }
    fragment OtherMutation on Mutation { second }
  `);

  const errors = validate(schema, document, [singleMutationField]);

  expect(errors.map((error) => error.message)).toEqual([
    "A request may contain only one mutation field.",
  ]);
});

it("rejects a second mutation root field from an inline fragment", () => {
  const document = parse("mutation { first ... on Mutation { second } }");

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
