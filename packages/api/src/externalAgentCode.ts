import { ApplicationError } from "./core/applicationError";
import { connectDatabase, transactor } from "./core/db";
import { loadEnv } from "./core/env";
import { createEventBus } from "./core/events";
import { createLogger } from "./core/logger";
import { createExternalAgentCodeOnServer } from "./modules/externalAgents";

// Run inside the container: `docker compose exec -T broccoli node dist/externalAgentCode.js`.
// Prints an external agent one-time code, so an agent on the server connects without a pasted prompt.
// Exits 2 until setup has the agent chosen, so the agent can wait and retry; 1 on any other failure.

const env = loadEnv();
const logger = createLogger(env.logLevel);
const database = connectDatabase(env.databaseUrl, logger);
try {
  const { code } = await createExternalAgentCodeOnServer({
    orm: database.orm,
    transact: transactor(database.orm, createEventBus(logger)),
  });
  process.stdout.write(`${code}\n`);
} catch (error) {
  if (error instanceof ApplicationError && error.code === "CONFLICT") {
    process.stderr.write("Open Broccoli, name your company and choose Your agent first.\n");
    process.exitCode = 2;
  } else {
    logger.error({ err: error }, "Could not make an external agent code");
    process.exitCode = 1;
  }
} finally {
  await database.close();
}
