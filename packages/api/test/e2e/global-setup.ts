import { randomBytes } from "node:crypto";

import type { TestProject } from "vitest/node";

import { resolveDatabaseServerUrl } from "./support/database-server.js";
import {
  createTemplateDatabase,
  dropRunDatabases,
  type TestRun,
} from "./support/test-databases.js";

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
