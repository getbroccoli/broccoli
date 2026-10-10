import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPOSITORY_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const COMPOSE_SERVICE = "postgres-test";
const START_COMMAND = "docker compose up -d --wait postgres-test";

/**
 * Admin URL of the Postgres server that hosts the test databases: TEST_DATABASE_URL
 * when set, otherwise this checkout's Compose `postgres-test` service.
 */
export async function resolveDatabaseServerUrl(): Promise<string> {
  const configuredUrl = process.env.TEST_DATABASE_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }
  const address = await findComposePostgresAddress();
  return `postgres://broccoli@${address}/postgres`;
}

async function findComposePostgresAddress(): Promise<string> {
  const notRunning = `Postgres for end-to-end tests is not running. Start it with \`${START_COMMAND}\` or set TEST_DATABASE_URL.`;
  try {
    const { stdout } = await execFileAsync(
      "docker",
      ["compose", "--profile", "test", "port", COMPOSE_SERVICE, "5432"],
      { cwd: REPOSITORY_ROOT },
    );
    const address = stdout.trim();
    if (!address) {
      throw new Error(notRunning);
    }
    return address;
  } catch (error) {
    throw new Error(notRunning, { cause: error });
  }
}
