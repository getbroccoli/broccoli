import { join } from "node:path";
import { ESLint } from "eslint";
import { assert, expect, test, vi } from "vitest";

const eslint = new ESLint({ cwd: import.meta.dirname });

// The first lint builds the package's TypeScript program, which takes seconds.
vi.setConfig({ testTimeout: 30_000 });

test("rejects a feature importing an undeclared feature", async () => {
  const errors = await lintErrors("src/features/employees/index.ts", 'import "../setup";');

  expect(errors).not.toEqual([]);
});

test("allows a feature importing a declared feature", async () => {
  const errors = await lintErrors("src/features/setup/index.ts", 'import "../company";');

  expect(errors).toEqual([]);
});

test("rejects an aliased deep import past an index", async () => {
  const errors = await lintErrors(
    "src/features/setup/index.ts",
    'import "@/features/company/logoApi";',
  );

  expect(errors).not.toEqual([]);
});

test("allows a deep import into an exempt element", async () => {
  const errors = await lintErrors(
    "src/features/setup/index.ts",
    'import "@/components/ui/button";',
  );

  expect(errors).toEqual([]);
});

async function lintErrors(file: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: join(import.meta.dirname, file) });

  assert(result);
  expect(result.fatalErrorCount).toBe(0);
  return result.messages.filter(({ ruleId }) => ruleId?.startsWith("boundaries/"));
}
