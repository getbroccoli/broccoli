import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { expect, onTestFinished, test } from "vitest";

import { importRulesConfig } from "./importRules.js";

test("rejects an element that does not exist on disk", () => {
  const packageDir = packageWith([], { elements: { "src/missing": [] } });

  expect(() => importRulesConfig(packageDir)).toThrow(
    new Error('importRules.json: "src/missing" does not exist'),
  );
});

test("rejects a target that does not exist on disk", () => {
  const packageDir = packageWith(["src/billing"], { elements: { "src/billing": ["src/missing"] } });

  expect(() => importRulesConfig(packageDir)).toThrow(
    new Error('importRules.json: "src/missing" does not exist'),
  );
});

test("rejects an existing target that is not an element", () => {
  const packageDir = packageWith(["src/billing", "src/payroll"], {
    elements: { "src/billing": ["src/payroll"] },
  });

  expect(() => importRulesConfig(packageDir)).toThrow(
    new Error('importRules.json: "src/billing" lists "src/payroll", which is not an element'),
  );
});

test("rejects a single-file element inside a folder element", () => {
  const packageDir = packageWith(["src/billing"], {
    elements: { "src/billing": [], "src/billing/report": [] },
  });
  writeFileSync(join(packageDir, "src/billing/report.ts"), "export const report = true;");

  expect(() => importRulesConfig(packageDir)).toThrow(
    new Error('importRules.json: "src/billing/report" is a file inside element "src/billing"'),
  );
});

test("rejects a layer that lists an unknown layer", () => {
  const packageDir = packageWith(["src/billing/app"], {
    elements: { "src/billing": [] },
    layers: { app: ["missing"] },
  });

  expect(() => importRulesConfig(packageDir)).toThrow(
    new Error('importRules.json: layer "app" lists "missing", which is not a layer'),
  );
});

test("rejects a cycle between elements", () => {
  const packageDir = packageWith(["src/billing", "src/payroll"], {
    elements: { "src/billing": ["src/payroll"], "src/payroll": ["src/billing"] },
  });

  expect(() => importRulesConfig(packageDir)).toThrow(
    /import cycle: (?=.*src\/billing)(?=.*src\/payroll)/,
  );
});

test("rejects a cycle that appears when layers are expanded", () => {
  const packageDir = packageWith(["src/billing/domain", "src/billing/db"], {
    elements: { "src/billing": [] },
    layers: { domain: ["db"], db: ["domain"] },
  });

  expect(() => importRulesConfig(packageDir)).toThrow(
    /import cycle: (?=.*src\/billing\/domain)(?=.*src\/billing\/db)/,
  );
});

test("allows test support to import an element whose tests use it", () => {
  const packageDir = packageWith(["src/billing", "test/support"], {
    elements: { "src/billing": [], "test/support": ["src/billing"] },
    testsMayImport: { "src/billing": ["test/support"] },
  });

  expect(() => importRulesConfig(packageDir)).not.toThrow();
});

test("allows an import of a declared element through its index", async () => {
  const errors = await lintErrors(
    "src/modules/billing/index.ts",
    'import { payroll } from "../payroll";',
  );

  expect(errors).toEqual([]);
});

test("rejects an import of an undeclared element", async () => {
  const errors = await lintErrors(
    "src/modules/payroll/index.ts",
    'import { billing } from "../billing";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects a type-only import of an undeclared element", async () => {
  const errors = await lintErrors(
    "src/modules/payroll/index.ts",
    'import type { billing } from "../billing";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects a TypeScript import type of an undeclared element", async () => {
  const errors = await lintErrors(
    "src/modules/payroll/index.ts",
    'type X = typeof import("../billing");',
  );

  expect(errors).not.toEqual([]);
});

test("rejects a JavaScript re-export of an undeclared element", async () => {
  const errors = await lintErrors(
    "src/modules/payroll/x.js",
    'export { billing } from "../billing";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects a relative deep import past an index", async () => {
  const errors = await lintErrors(
    "src/modules/billing/index.ts",
    'import { internal } from "../../core/db/internal";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects an aliased deep import past an index", async () => {
  const errors = await lintErrors(
    "src/modules/billing/index.ts",
    'import { domain } from "@/modules/payroll/domain";',
  );

  expect(errors).not.toEqual([]);
});

test("allows an import of a single-file element", async () => {
  const errors = await lintErrors(
    "src/modules/billing/index.ts",
    'import { logger } from "../../core/logger";',
  );

  expect(errors).toEqual([]);
});

test("allows a deep import into an exempt element", async () => {
  const errors = await lintErrors(
    "src/modules/billing/index.ts",
    'import { button } from "@/components/ui/button";',
  );

  expect(errors).toEqual([]);
});

test("allows a layer to import a declared sibling layer", async () => {
  const errors = await lintErrors(
    "src/modules/billing/app/index.ts",
    'import { db } from "../db";',
  );

  expect(errors).toEqual([]);
});

test("rejects a layer importing an undeclared sibling layer", async () => {
  const errors = await lintErrors(
    "src/modules/billing/domain/index.ts",
    'import { app } from "../app";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects an import of another module's layer", async () => {
  const errors = await lintErrors(
    "src/modules/billing/app/index.ts",
    'import { domain } from "../../payroll/domain";',
  );

  expect(errors).not.toEqual([]);
});

test("allows a test to import shared test support", async () => {
  const errors = await lintErrors(
    "src/modules/billing/app/x.test.ts",
    'import { support } from "#test/support";',
  );

  expect(errors).toEqual([]);
});

test("allows a layer's test to use its element's test-only imports", async () => {
  const errors = await lintErrors(
    "src/modules/payroll/domain/x.test.ts",
    'import { billing } from "../../billing";',
  );

  expect(errors).toEqual([]);
});

test("rejects production code importing shared test support", async () => {
  const errors = await lintErrors(
    "src/modules/billing/app/index.ts",
    'import { support } from "#test/support";',
  );

  expect(errors).not.toEqual([]);
});

test("rejects production code importing a test in the same folder element", async () => {
  const packageDir = packageWith(["src/core/db"], { elements: { "src/core/db": [] } });
  writeFileSync(join(packageDir, "tsconfig.json"), JSON.stringify({ include: ["src"] }));
  writeFileSync(join(packageDir, "src/core/db/x.test.ts"), "export const value = true;");

  const errors = await lintErrors("src/core/db/index.ts", 'import "./x.test";', packageDir);

  expect(errors).not.toEqual([]);
});

test("rejects production code importing a single-file element's test", async () => {
  const packageDir = packageWith(["src/modules/billing", "src/core"], {
    elements: { "src/modules/billing": ["src/core/logger"], "src/core/logger": [] },
  });
  writeFileSync(join(packageDir, "tsconfig.json"), JSON.stringify({ include: ["src"] }));
  writeFileSync(join(packageDir, "src/core/logger.ts"), "export const logger = true;");
  writeFileSync(join(packageDir, "src/core/logger.test.ts"), "export const value = true;");

  const errors = await lintErrors(
    "src/modules/billing/index.ts",
    'import "../../core/logger.test";',
    packageDir,
  );

  expect(errors).not.toEqual([]);
});

test("rejects a file that belongs to no element", async () => {
  const errors = await lintErrors("src/unlisted/x.ts", "export const value = true;");

  expect(errors).not.toEqual([]);
});

test("rejects a test file that belongs to no element", async () => {
  const errors = await lintErrors("src/unlisted/x.test.ts", "export const value = true;");

  expect(errors).not.toEqual([]);
});

test("rejects a wildcard re-export", async () => {
  const errors = await lintErrors("src/modules/billing/index.ts", 'export * from "../payroll";');

  expect(errors).not.toEqual([]);
});

async function lintErrors(
  file,
  code,
  fixtureDir = fileURLToPath(new URL("./test/importRulesFixture/", import.meta.url)),
) {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ["**/*.{ts,tsx}"], languageOptions: { parser: tseslint.parser } },
      ...importRulesConfig(fixtureDir),
    ],
  });

  const [result] = await eslint.lintText(code, { filePath: join(fixtureDir, file) });
  return result.messages;
}

function packageWith(folders, rules) {
  const packageDir = mkdtempSync(join(tmpdir(), "import-rules-"));
  onTestFinished(() => rmSync(packageDir, { recursive: true, force: true }));
  for (const folder of folders) mkdirSync(join(packageDir, folder), { recursive: true });
  writeFileSync(join(packageDir, "importRules.json"), JSON.stringify(rules));
  return packageDir;
}
