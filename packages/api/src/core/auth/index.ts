export { authDatabase, createAuth, type Auth, type AuthConfig } from "./auth";
export { fixedAuth, type AuthSource } from "./authSource";
export { deploymentRouter } from "./deploymentRouter";
export type { DeploymentServer } from "./deploymentServer";
/** `user` only for foreign keys; Better Auth and `authUserRepository` write it. */
export { authUserRepository, user } from "./db";
