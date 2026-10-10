import { loadEnv } from "./core/env";
import { createLogger } from "./core/logger";
import { startServer } from "./core/server";

const env = loadEnv();
const logger = createLogger(env.logLevel);
const server = await startServer(env, logger);
logger.info({ url: server.url }, "Broccoli API listening");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "Shutting down");
    server.stop().catch((error: unknown) => {
      logger.error({ err: error }, "Shutdown failed");
      process.exitCode = 1;
    });
  });
}
