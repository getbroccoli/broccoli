import { expect, it } from "vitest";

import { ApplicationError } from "../applicationError";
import { mutationPayload } from "./mutationPayload";

it("returns the result under its field on success, with a null error when errors are expected", async () => {
  const company = { id: "company" };

  const withoutErrors = await mutationPayload<CompanyPayload>("company", () =>
    Promise.resolve(company),
  );
  const withErrors = await mutationPayload<CompanyUpdatePayload>(
    "company",
    () => Promise.resolve(company),
    ["INVALID_INPUT"],
  );

  expect(withoutErrors).toEqual({ company });
  expect(withErrors).toEqual({ company, error: null });
});

it("returns a listed invalid input error with its fields", async () => {
  const error = new ApplicationError("INVALID_INPUT", "The input is invalid.", [
    { field: "email", code: "taken" },
  ]);

  const payload = await mutationPayload<EmployeePayload>("employee", () => Promise.reject(error), [
    "INVALID_INPUT",
  ]);

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

  const payload = await mutationPayload<ImportPayload>("import", () => Promise.reject(error), [
    "CONFLICT",
  ]);

  expect(payload).toEqual({
    error: { __typename: "ConflictError", message: "Files are still being read." },
  });
});

it("rethrows an application error whose code is not listed", async () => {
  const error = new ApplicationError("FORBIDDEN", "Only the owner may do this.");

  const result = mutationPayload<EmployeePayload>("employee", () => Promise.reject(error), [
    "INVALID_INPUT",
  ]);

  await expect(result).rejects.toBe(error);
});

// Payload types as codegen generates them: the changed object, and `error` where it can fail.
interface CompanyPayload {
  company?: { id: string } | null;
}
interface CompanyUpdatePayload {
  company?: { id: string } | null;
  error?: unknown;
}
interface EmployeePayload {
  employee?: { id: string } | null;
  error?: unknown;
}
interface ImportPayload {
  import?: Record<string, never> | null;
  error?: unknown;
}
