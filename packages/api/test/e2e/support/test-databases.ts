import pg from "pg";

import { connectDatabase } from "../../../src/db/database.js";
import { createLogger } from "../../../src/logger.js";

/** One `pnpm test:e2e` run: every database it creates is named after `runId`. */
export interface TestRun {
  serverUrl: string;
  runId: string;
}

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

const TEST_DATABASE_NAME = /^broccoli_test_[a-z0-9_]+$/;

/** Creates the run's template database and applies all migrations to it once. */
export async function createTemplateDatabase(run: TestRun): Promise<void> {
  const name = templateName(run);
  await withServerClient(run, (client) => createDatabase(client, name));
  const database = connectDatabase(databaseUrl(run, name), createLogger("silent"));
  try {
    await database.migrate();
  } finally {
    await database.close();
  }
}

/** A fresh database cloned from the run's migrated template. */
export async function createTestDatabase(run: TestRun): Promise<TestDatabase> {
  return createRunDatabase(run, templateName(run));
}

/** A fresh database with no migrations applied. */
export async function createEmptyTestDatabase(run: TestRun): Promise<TestDatabase> {
  return createRunDatabase(run);
}

/** Drops every database this run created, including ones left by failed tests. */
export async function dropRunDatabases(run: TestRun): Promise<void> {
  await withServerClient(run, async (client) => {
    const { rows } = await client.query<{ datname: string }>(
      "select datname from pg_database where starts_with(datname, $1)",
      [runPrefix(run)],
    );
    for (const { datname } of rows) {
      await dropDatabase(client, datname);
    }
  });
}

async function createRunDatabase(run: TestRun, template?: string): Promise<TestDatabase> {
  const name = `${runPrefix(run)}${crypto.randomUUID().slice(0, 8)}`;
  await withServerClient(run, (client) => createDatabase(client, name, template));
  return {
    url: databaseUrl(run, name),
    drop: () => withServerClient(run, (client) => dropDatabase(client, name)),
  };
}

async function createDatabase(client: pg.Client, name: string, template?: string): Promise<void> {
  const templateClause = template ? ` template ${quoteTestDatabaseName(template)}` : "";
  await client.query(`create database ${quoteTestDatabaseName(name)}${templateClause}`);
}

async function dropDatabase(client: pg.Client, name: string): Promise<void> {
  await client.query(`drop database if exists ${quoteTestDatabaseName(name)} with (force)`);
}

/** Refuses any name outside the test namespace, so the harness can never touch real data. */
function quoteTestDatabaseName(name: string): string {
  if (!TEST_DATABASE_NAME.test(name)) {
    throw new Error(`Refusing to touch non-test database "${name}"`);
  }
  return pg.escapeIdentifier(name);
}

function runPrefix(run: TestRun): string {
  return `broccoli_test_${run.runId}_`;
}

function templateName(run: TestRun): string {
  return `${runPrefix(run)}template`;
}

function databaseUrl(run: TestRun, name: string): string {
  const url = new URL(run.serverUrl);
  url.pathname = `/${name}`;
  return url.href;
}

async function withServerClient<T>(
  run: TestRun,
  work: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: run.serverUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
