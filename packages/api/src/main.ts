import { loadEnv } from "./core/env";
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
    slack: { relayUrl: env.slackRelayUrl, apiUrl: "https://slack.com/api" },
    model:
      env.modelApiKey === null
        ? null
        : { url: "https://openrouter.ai/api", apiKey: env.modelApiKey },
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
