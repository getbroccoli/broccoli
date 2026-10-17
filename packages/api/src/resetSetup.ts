// `reset-setup` in the image: frees self-hosted setup held by a lost or stolen browser.
import { connectDatabase, transactor } from "./core/db";
import { loadEnv } from "./core/env";
import { createEventBus } from "./core/events";
import { OwnerExistsError, resetSetup } from "./core/instance";
import { createLogger } from "./core/logger";
import { PrincipalSecurityContext } from "./core/security";

const env = loadEnv();
if (env.deployment.mode !== "self_hosted") {
  console.error("Managed instances have no setup to reset.");
  process.exit(1);
}
const logger = createLogger(env.logLevel);
const database = connectDatabase(env.databaseUrl, logger);
try {
  await transactor(
    database.orm,
    createEventBus(logger),
  )((tx) => resetSetup(PrincipalSecurityContext.system(), tx));
  console.log("Setup is free: the next browser to open Broccoli continues it.");
} catch (error) {
  if (!(error instanceof OwnerExistsError)) {
    throw error;
  }
  console.error("The owner exists, so setup is over; sign in instead.");
  process.exitCode = 1;
} finally {
  await database.close();
}
