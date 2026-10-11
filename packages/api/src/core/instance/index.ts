import "./events";

export {
  advanceStep,
  claimOwner,
  hasOwner,
  readOnboardingStep,
  readOwner,
  readOwnerUserId,
} from "./app";
export { setupPlugin } from "./better-auth";
/** For the schema and test seeding only; other code goes through the operations above. */
export { instance, instanceRepository } from "./db";
export { ONBOARDING_STEPS, OwnerExistsError, type OnboardingStep } from "./domain";
