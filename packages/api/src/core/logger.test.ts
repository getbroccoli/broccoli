import { DrizzleQueryError } from "drizzle-orm";
import { DatabaseError } from "pg";
import { expect, it } from "vitest";

import { createLogger } from "./logger";

it("logs a failed query without its parameter values", () => {
  let output = "";
  const logger = createLogger("error", {
    write(line: string) {
      output += line;
    },
  });
  const error = new DrizzleQueryError(
    'insert into "employees" ("email") values ($1)',
    ["ada@example.com"],
    new Error("connection lost"),
  );

  logger.error({ err: error });

  expect(output).toContain('insert into \\"employees\\"');
  expect(output).not.toContain("ada@example.com");
  expect(JSON.parse(output)).not.toHaveProperty("err.params");
});

it("logs a database error without its row values", () => {
  let output = "";
  const logger = createLogger("error", {
    write(line: string) {
      output += line;
    },
  });
  const error = new DatabaseError("duplicate key value violates unique constraint", 0, "error");
  error.code = "23505";
  error.constraint = "employees_email_unique";
  error.detail = "Key (email)=(ada@example.com) already exists.";

  logger.error({ err: error });

  expect(output).toContain("employees_email_unique");
  expect(output).not.toContain("ada@example.com");
  expect(JSON.parse(output)).toMatchObject({
    err: {
      message: "duplicate key value violates unique constraint",
      code: "23505",
      constraint: "employees_email_unique",
    },
  });
  expect(JSON.parse(output)).not.toHaveProperty("err.detail");
});
