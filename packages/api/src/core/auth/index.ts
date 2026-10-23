// Public values.
export { authDatabase, createBetterAuth } from "./createBetterAuth";
export { authHandler, fixedAuth } from "./authSource";
export { account, session, user } from "./schema";

// Public types.
export type { Auth, AuthConfig } from "./createBetterAuth";
export type { AuthSource } from "./authSource";
export type { DeploymentServer } from "./deploymentServer";
