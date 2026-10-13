import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("rejects a pattern that matches no element", () => {
  const packageDir = packageWith(["src/billing"], {
    elements: { "src/billing": ["src/core/*"] },
  });

  expect(() => importRulesConfig(packageDir)).toThrow(
    new Error('importRules.json: "src/billing" lists "src/core/*", which matches no element'),
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

test("rejects a cycle formed through a pattern", () => {
  const packageDir = packageWith(["src/billing", "src/payroll"], {
    elements: { "src/billing": ["src/*"], "src/payroll": ["src/billing"] },
  });

  expect(() => importRulesConfig(packageDir)).toThrow(
    /import cycle: (?=.*src\/billing)(?=.*src\/payroll)/,
  );
});

test("accepts an element whose pattern also matches itself", () => {
  const packageDir = packageWith(["src/core/db", "src/core/logger"], {
    elements: { "src/core/db": ["src/core/*"], "src/core/logger": [] },
  });

  expect(() => importRulesConfig(packageDir)).not.toThrow();
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

function packageWith(folders, rules) {
  const packageDir = mkdtempSync(join(tmpdir(), "import-rules-"));
  onTestFinished(() => rmSync(packageDir, { recursive: true, force: true }));
  for (const folder of folders) mkdirSync(join(packageDir, folder), { recursive: true });
  writeFileSync(join(packageDir, "importRules.json"), JSON.stringify(rules));
  return packageDir;
}
