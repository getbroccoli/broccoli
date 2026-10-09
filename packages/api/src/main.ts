import { loadEnv } from "./env.js";
import { createLogger } from "./logger.js";
import { startServer } from "./server.js";

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
