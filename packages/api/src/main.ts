import { loadEnv } from "./core/env";
import { createLogger } from "./core/logger";
import { startServer } from "./core/server";
import { createModules } from "./modules";

const env = loadEnv();
const logger = createLogger(env.logLevel);
const server = await startServer(env, logger, (core) =>
  createModules(core, {
    deployment: env.deployment,
    brandLookupUrl: env.brandLookupUrl,
    slack: { relayUrl: env.slackRelayUrl, apiUrl: "https://slack.com/api" },
    openRouter: { url: "https://openrouter.ai/api", key: env.openRouterKey },
    broccoliAiUrl: env.broccoliAiUrl,
    resendApiUrl: "https://api.resend.com",
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
