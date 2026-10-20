import { redirect } from "@tanstack/react-router";

import type { Mode, SetupStep } from "@/__generated__/graphql";

/**
 * A route gate for a setup page: sends a visitor who is neither signed in nor holding
 * setup to login. The self-hosted holder can revisit company details before approving import.
 */
export function requireSetupStep<Me>(step: SetupStep, { context, location }: Gate<Me>): void {
  if (!context.me && !context.holdsSetup) {
    throw loginRedirect(location.href);
  }
  const editingCompany =
    step === "COMPANY" && context.setupStep === "IMPORT" && context.mode === "SELF_HOSTED";
  if (context.setupStep !== step && !editingCompany) {
    throw redirect({ to: setupStepPage(context.setupStep, context.mode), replace: true });
  }
}

/** The first page of a setup step. */
export function setupStepPage(
  step: SetupStep,
  mode: Mode,
): (typeof STEP_PAGES)[SetupStep] | typeof SETUP_AI {
  // A self-hosted owner picks how files are read before bringing people in.
  return step === "IMPORT" && mode === "SELF_HOSTED" ? SETUP_AI : STEP_PAGES[step];
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

const SETUP_AI = "/setup/ai";

const STEP_PAGES = {
  COMPANY: "/setup/company",
  IMPORT: "/setup/import",
  OWNER: "/setup",
  READY: "/setup/ready",
  DONE: "/people",
} as const satisfies Record<SetupStep, string>;

interface Gate<Me> {
  context: { me: Me | null; holdsSetup: boolean; setupStep: SetupStep; mode: Mode };
  location: { href: string };
}

function loginRedirect(href: string) {
  return redirect({ to: "/login", search: { redirect: href }, replace: true });
}
