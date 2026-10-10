import { buildSchema, parse, validate } from "graphql";
import { expect, it } from "vitest";

import { depthLimit } from "./depth-limit";

const schema = buildSchema(`
  type Query { node: Node, ping: String }
  type Node { node: Node, value: String }
`);

it("accepts a field at depth 10", () => {
  const document = parse(`{ ${"node { ".repeat(9)}value${" }".repeat(9)} }`);

  const errors = validate(schema, document, [depthLimit(10)]);

  expect(errors).toEqual([]);
});

it("rejects a field at depth 11", () => {
  const document = parse(`{ ${"node { ".repeat(10)}value${" }".repeat(10)} }`);

  const errors = validate(schema, document, [depthLimit(10)]);

  expect(errors.map((error) => error.message)).toEqual([
    "Operation exceeds the maximum depth of 10.",
  ]);
});

it("counts field depth through named fragments", () => {
  const document = parse(`
    { node { ...Details } }
    fragment Details on Node { node { value } }
  `);

  const errors = validate(schema, document, [depthLimit(2)]);

  expect(errors.map((error) => error.message)).toEqual([
    "Operation exceeds the maximum depth of 2.",
  ]);
});

it("counts field depth through inline fragments", () => {
  const document = parse("{ node { ... on Node { node { value } } } }");

  const errors = validate(schema, document, [depthLimit(2)]);

  expect(errors.map((error) => error.message)).toEqual([
    "Operation exceeds the maximum depth of 2.",
  ]);
});

it("ignores __typename beyond the depth limit", () => {
  const document = parse(`{ ${"node { ".repeat(10)}__typename${" }".repeat(10)} }`);

  const errors = validate(schema, document, [depthLimit(10)]);

  expect(errors).toEqual([]);
});

it("accepts a shallow query through a 40-level doubling fragment chain", () => {
  const fragments = Array.from(
    { length: 40 },
    (_, level) => `fragment F${level} on Query { ...F${level + 1} ...F${level + 1} }`,
  ).join("\n");
  const document = parse(`{ ...F0 } ${fragments} fragment F40 on Query { ping }`);

  const errors = validate(schema, document, [depthLimit(10)]);

  expect(errors).toEqual([]);
}, 1_000);
