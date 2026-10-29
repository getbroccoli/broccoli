import { connectDatabase, transactor } from "./core/db";
import { loadEnv } from "./core/env";
import { createEventBus } from "./core/events";
import { createMailSettings } from "./core/instance";
import { createLogger } from "./core/logger";
import { createSecretBox, ensureSecret } from "./core/secrets";
import { PrincipalSecurityContext } from "./core/security";

// `pnpm dev` runs this after migrations, once Compose knows the browser-facing port.
const env = loadEnv();
const logger = createLogger(env.logLevel);
const linkOrigin = new URL(process.argv[2]!).origin;
const secretBox = createSecretBox(await ensureSecret(env.dataDir, "encryption-key"));
const database = connectDatabase(env.databaseUrl, logger);
try {
  await createMailSettings({
    orm: database.orm,
    transact: transactor(database.orm, createEventBus(logger)),
    secretBox,
    deployment: env.deployment,
    logger,
    resendApiUrl: "https://api.resend.com",
  }).configureDevelopmentMail(PrincipalSecurityContext.system(), linkOrigin);
} finally {
  await database.close();
}
