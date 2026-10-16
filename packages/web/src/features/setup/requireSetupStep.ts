import { redirect } from "@tanstack/react-router";

import type { SetupStep } from "@/__generated__/graphql";

/**
 * A route gate for a setup page: sends a visitor who is neither signed in nor holding
 * setup to login, and anyone whose setup is at another step to that step's page.
 */
export function requireSetupStep<Me>(step: SetupStep, { context, location }: Gate<Me>): void {
  if (!context.me && !context.holdsSetup) {
    throw loginRedirect(location.href);
  }
  if (context.setupStep !== step) {
    throw redirect({ to: STEP_PAGES[context.setupStep], replace: true });
  }
}

/** The gate of the app itself: a signed-in user once setup is done. Returns them. */
export function requireFinishedSetup<Me>(gate: Gate<Me>): Me {
  requireSetupStep("DONE", gate);
  // Setup ends by signing the new owner in, so only a signed-in user gets here.
  if (!gate.context.me) {
    throw loginRedirect(gate.location.href);
  }
  return gate.context.me;
}

const STEP_PAGES = {
  COMPANY: "/setup/company",
  IMPORT: "/setup/import",
  OWNER: "/setup",
  DONE: "/people",
} as const satisfies Record<SetupStep, string>;

interface Gate<Me> {
  context: { me: Me | null; holdsSetup: boolean; setupStep: SetupStep };
  location: { href: string };
}

function loginRedirect(href: string) {
  return redirect({ to: "/login", search: { redirect: href }, replace: true });
}
