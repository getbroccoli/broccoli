import { redirect } from "@tanstack/react-router";

import type { SetupStep } from "@/__generated__/graphql";

const STEP_PAGES = {
  OWNER: "/setup",
  COMPANY: "/setup/company",
  IMPORT: "/setup/import",
  DONE: "/people",
} as const satisfies Record<SetupStep, string>;

interface Gate<Me> {
  context: { me: Me | null; setupStep: SetupStep };
  location: { href: string };
}

/**
 * A route gate: sends a signed-out visitor to login, and a user whose setup is at another step
 * to that step's page. Returns the signed-in user.
 */
export function requireSetupStep<Me>(step: SetupStep, { context, location }: Gate<Me>): Me {
  if (!context.me) {
    throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
  }
  if (context.setupStep !== step) {
    throw redirect({ to: STEP_PAGES[context.setupStep], replace: true });
  }
  return context.me;
}
