import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";

import { namespaceTypePolicies } from "./type-policies";

describe("namespaceTypePolicies", () => {
  it("merges an id-less type returned by a Query field", () => {
    const schema = buildSchema(`
      type Query { absences: AbsenceQuery }
      type AbsenceQuery { count: Int }
    `);

    const policies = namespaceTypePolicies(schema);

    expect(policies).toEqual({ AbsenceQuery: { merge: true } });
  });

  it("merges an id-less type returned by a Mutation field", () => {
    const schema = buildSchema(`
      type Query { ping: String }
      type Mutation { absence: AbsenceMutation }
      type AbsenceMutation { request: Boolean }
    `);

    const policies = namespaceTypePolicies(schema);

    expect(policies).toEqual({ AbsenceMutation: { merge: true } });
  });

  it("leaves out a type with an id field", () => {
    const schema = buildSchema(`
      type Query { absence: Absence }
      type Absence { id: ID! }
    `);

    const policies = namespaceTypePolicies(schema);

    expect(policies).toEqual({});
  });

  it("unwraps non-null and list wrappers", () => {
    const schema = buildSchema(`
      type Query { absences: [AbsenceQuery!]! }
      type AbsenceQuery { count: Int }
    `);

    const policies = namespaceTypePolicies(schema);

    expect(policies).toEqual({ AbsenceQuery: { merge: true } });
  });

  it("adds nothing for a scalar root field", () => {
    const schema = buildSchema(`
      type Query { ping: String! }
    `);

    const policies = namespaceTypePolicies(schema);

    expect(policies).toEqual({});
  });
});
