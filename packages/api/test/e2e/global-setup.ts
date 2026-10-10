import { randomBytes } from "node:crypto";

import type { TestProject } from "vitest/node";

// Global setup runs outside the test runner, so it skips the index, which loads the `test` fixture.
import { resolveDatabaseServerUrl } from "./support/database-server";
import { createTemplateDatabase, dropRunDatabases, type TestRun } from "./support/test-databases";

declare module "vitest" {
  export interface ProvidedContext {
    testRun: TestRun;
  }
}

export default async function setup(project: TestProject) {
  const run: TestRun = {
    serverUrl: await resolveDatabaseServerUrl(),
    runId: randomBytes(4).toString("hex"),
  };
  try {
    await createTemplateDatabase(run);
  } catch (error) {
    await dropRunDatabases(run);
    throw error;
  }
  project.provide("testRun", run);
  return () => dropRunDatabases(run);
}
