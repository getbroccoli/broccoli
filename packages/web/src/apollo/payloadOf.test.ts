import { expect, it } from "vitest";

import { payloadOf } from "./payloadOf";

it("reads a payload without an error field", () => {
  const payload = { import: { id: "import" } };

  const outcome = payloadOf({ skipImport: payload });

  expect(outcome).toEqual({ payload, error: null });
});

it("reads a payload with a null error", () => {
  const payload = { company: { id: "company" }, error: null };

  const outcome = payloadOf({ updateCompany: payload });

  expect(outcome).toEqual({ payload, error: null });
});

it("returns the payload error object", () => {
  const error = {
    __typename: "InvalidInputError",
    message: "The input is invalid.",
    fields: [{ field: "email", code: "taken" }],
  };
  const payload = { employee: null, error };

  const outcome = payloadOf({ createEmployee: payload });

  expect(outcome).toEqual({ payload, error });
});

it("rejects missing or null payload data", () => {
  const results = [undefined, null, {}, { skipImport: null }];

  for (const data of results) {
    expect(() => payloadOf(data)).toThrow("The mutation returned no payload.");
  }
});

it("finds an aliased operation while skipping typenames", () => {
  const payload = { import: { id: "import" } };
  const data = {
    __typename: "Mutation",
    peopleImport: payload,
  };

  const outcome = payloadOf(data);

  expect(outcome).toEqual({ payload, error: null });
});
