import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { expect, it } from "vitest";

import { isUniqueViolation } from ".";

const constraint = "employees_email_unique";

it("recognises a unique violation of the constraint wrapped in a DrizzleQueryError", () => {
  const cause = new DatabaseError("Duplicate email", 0, "error");
  cause.code = "23505";
  cause.constraint = constraint;
  const error = new DrizzleQueryError(
    "insert into employees (email) values ($1)",
    ["employee@example.com"],
    cause,
  );

  expect(isUniqueViolation(error, constraint)).toBe(true);
});

it("recognises an unwrapped unique violation", () => {
  const error = new DatabaseError("Duplicate email", 0, "error");
  error.code = "23505";
  error.constraint = constraint;

  expect(isUniqueViolation(error, constraint)).toBe(true);
});

it("ignores a unique violation of another constraint", () => {
  const error = new DatabaseError("Duplicate id", 0, "error");
  error.code = "23505";
  error.constraint = "employees_pkey";

  expect(isUniqueViolation(error, constraint)).toBe(false);
});

it("ignores another database error on the same constraint", () => {
  const error = new DatabaseError("Foreign key violation", 0, "error");
  error.code = "23503";
  error.constraint = constraint;

  expect(isUniqueViolation(error, constraint)).toBe(false);
});

it("ignores an error that is not a database error", () => {
  const error = Object.assign(new Error("Duplicate email"), { code: "23505", constraint });

  expect(isUniqueViolation(error, constraint)).toBe(false);
});
