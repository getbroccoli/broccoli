import { expect, it } from "vitest";

import { ApplicationError } from "../applicationError";
import { mutationPayload } from "./mutationPayload";

it("returns the named result without an error field when no codes are listed", async () => {
  const company = { id: "company" };

  const payload = await mutationPayload("company", () => Promise.resolve(company));

  expect(payload).toEqual({ company });
});

it("returns a null error on success when codes are listed", async () => {
  const employee = { id: "employee" };

  const payload = await mutationPayload("employee", () => Promise.resolve(employee), [
    "INVALID_INPUT",
  ]);

  expect(payload).toEqual({ employee, error: null });
});

it("returns a listed invalid input error with its fields", async () => {
  const error = new ApplicationError("INVALID_INPUT", "The input is invalid.", [
    { field: "email", code: "taken" },
  ]);

  const payload = await mutationPayload("employee", () => Promise.reject(error), ["INVALID_INPUT"]);

  expect(payload).toEqual({
    error: {
      __typename: "InvalidInputError",
      message: "The input is invalid.",
      fields: [{ field: "email", code: "taken" }],
    },
  });
});

it("returns a listed conflict error", async () => {
  const error = new ApplicationError("CONFLICT", "Files are still being read.");

  const payload = await mutationPayload("import", () => Promise.reject(error), ["CONFLICT"]);

  expect(payload).toEqual({
    error: { __typename: "ConflictError", message: "Files are still being read." },
  });
});

it("rethrows an application error whose code is not listed", async () => {
  const error = new ApplicationError("FORBIDDEN", "Only the owner may do this.");

  const result = mutationPayload("employee", () => Promise.reject(error), ["INVALID_INPUT"]);

  await expect(result).rejects.toBe(error);
});
