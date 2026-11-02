import { ApplicationError } from "./core/applicationError";
import { connectDatabase, transactor } from "./core/db";
import { loadEnv } from "./core/env";
import { createEventBus } from "./core/events";
import { createLogger } from "./core/logger";
import { PrincipalSecurityContext } from "./core/security";
import {
  createExternalAgentActivity,
  createExternalAgentSessionService,
} from "./modules/externalAgents";

// Run inside the container: `docker compose exec -T broccoli node dist/externalAgentCode.js`.
// Prints an external agent one-time code, so an agent on the server connects without a pasted prompt.
// It works right after install: it chooses the agent while the owner has chosen no AI.
// Exits 2 when setup no longer takes the agent; 1 on any other failure.

const env = loadEnv();
const logger = createLogger(env.logLevel);
const database = connectDatabase(env.databaseUrl, logger);
try {
  // As the system: whoever can run this command already controls the server.
  const sessions = createExternalAgentSessionService({
    orm: database.orm,
    transact: transactor(database.orm, createEventBus(logger)),
    clock: () => new Date(),
    activity: createExternalAgentActivity(),
  });
  const { code } = await sessions.createExternalAgentCodeOnServer(
    PrincipalSecurityContext.system(),
  );
  process.stdout.write(`${code}\n`);
} catch (error) {
  if (error instanceof ApplicationError && error.code === "CONFLICT") {
    process.stderr.write(
      "Setup no longer takes your agent: the owner chose another AI, or setup is past its import.\n",
    );
    process.exitCode = 2;
  } else {
    logger.error({ err: error }, "Could not make an external agent code");
    process.exitCode = 1;
  }
} finally {
  await database.close();
}
