import "./events";

export {
  advanceStep,
  claimOwner,
  hasOwner,
  readSetupStep,
  readOwner,
  readOwnerUserId,
} from "./app";
export { setupPlugin } from "./betterAuth";
/** For the schema and test seeding only; other code goes through the operations above. */
export { instance, instanceRepository } from "./db";
export { SETUP_STEPS, OwnerExistsError, type SetupStep } from "./domain";
