import { join } from "node:path";
import { ESLint } from "eslint";
import { assert, expect, test } from "vitest";

const eslint = new ESLint({ cwd: import.meta.dirname });

test("rejects a module importing an undeclared module", async () => {
  const errors = await lintErrors("src/modules/employees/index.ts", 'import "../company";');

  expect(errors).not.toEqual([]);
});

test("allows a module importing a declared element", async () => {
  const errors = await lintErrors("src/modules/company/index.ts", 'import "../../core/instance";');

  expect(errors).toEqual([]);
});

test("rejects a relative deep import past an index", async () => {
  const errors = await lintErrors(
    "src/modules/company/app/useCases/getCompany.ts",
    'import "../../../../core/db/transaction";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects a domain layer importing its db layer", async () => {
  const errors = await lintErrors("src/modules/company/domain/index.ts", 'import "../db";');

  expect(errors).not.toEqual([]);
});

test("allows an app layer importing its db layer", async () => {
  const errors = await lintErrors("src/modules/company/app/index.ts", 'import "../db";');

  expect(errors).toEqual([]);
});

test("rejects a layer importing another module's layer", async () => {
  const errors = await lintErrors(
    "src/modules/company/app/index.ts",
    'import "../../employees/db";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects a TypeScript import type of an undeclared element", async () => {
  const errors = await lintErrors(
    "src/modules/employees/index.ts",
    'type Company = typeof import("../company");',
  );

  expect(errors).not.toEqual([]);
});

test("rejects production code importing shared test support", async () => {
  const errors = await lintErrors("src/modules/company/app/index.ts", 'import "#test/support";');

  expect(errors).not.toEqual([]);
});

test("allows a test importing shared test support", async () => {
  const errors = await lintErrors(
    "src/modules/company/app/useCases/getCompany.int.test.ts",
    'import "#test/support";',
  );

  expect(errors).toEqual([]);
});

test("rejects production code importing a test file", async () => {
  const errors = await lintErrors(
    "src/modules/company/index.ts",
    'import "../../core/logger.test";',
  );

  expect(errors).not.toEqual([]);
});

test("allows an import of a single-file element", async () => {
  const errors = await lintErrors("src/modules/company/index.ts", 'import "../../core/logger";');

  expect(errors).toEqual([]);
});

async function lintErrors(file: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: join(import.meta.dirname, file) });

  assert(result);
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter(({ ruleId }) => ruleId?.startsWith("boundaries/"));
}
