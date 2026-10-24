import { expect, it } from "vitest";

import { ApplicationError } from "../applicationError";
import { multiFieldMutationPayload, mutationPayload } from "./mutationPayload";

it("returns the result under its field on success, with a null error when errors are expected", async () => {
  const company = { id: "company" };

  const withoutErrors = await mutationPayload<CompanyMutationPayload>("company", () =>
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

  const payload = await mutationPayload<ImportMutationPayload>(
    "import",
    () => Promise.reject(error),
    ["CONFLICT"],
  );

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

it("returns every result field with a null error", async () => {
  const employee = { id: "employee" };
  const historyLine = { id: "history" };

  const payload = await multiFieldMutationPayload<EmployeeUpdatePayload>(
    () => Promise.resolve({ employee, historyLine }),
    ["NOT_FOUND"],
  );

  expect(payload).toEqual({ employee, historyLine, error: null });
});

it("returns a listed error without the result fields", async () => {
  const error = new ApplicationError("NOT_FOUND", "No employee has this id.");

  const payload = await multiFieldMutationPayload<EmployeeUpdatePayload>(
    () => Promise.reject(error),
    ["NOT_FOUND"],
  );

  expect(payload).toEqual({
    error: { __typename: "NotFoundError", message: "No employee has this id." },
  });
});

// Payload types as codegen generates them: the changed object, and `error` where it can fail.
interface CompanyMutationPayload {
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
interface EmployeeUpdatePayload {
  employee?: { id: string } | null;
  historyLine?: { id: string } | null;
  error?: unknown;
}
interface ImportMutationPayload {
  import?: Record<string, never> | null;
  error?: unknown;
}
