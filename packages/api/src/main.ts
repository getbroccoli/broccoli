import { DEFAULT_ACCOUNTS_URL, loadEnv } from "./core/env";
import { createLogger } from "./core/logger";
import { startServer } from "./core/server";
import { createModules } from "./modules";

const env = loadEnv();
const logger = createLogger(env.logLevel);
const { deployment } = env;
const server = await startServer(env, logger, (core) =>
  createModules(core, {
    mode: deployment.mode,
    publicUrl: deployment.mode === "self_hosted" ? deployment.publicUrl : undefined,
    brandLookupUrl: env.brandLookupUrl,
    slack: {
      // The Slack relay is part of the accounts service.
      relayUrl: deployment.mode === "managed" ? deployment.accountsOrigin : DEFAULT_ACCOUNTS_URL,
      apiUrl: "https://slack.com/api",
    },
  }),
);
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
