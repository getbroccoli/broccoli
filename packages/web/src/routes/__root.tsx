import type { ApolloClient } from "@apollo/client";
import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";

import { readSession, setupStepPage } from "@/features/setup";
import { NotFoundPage, UnreachablePage } from "@/shell";

export interface RouterContext {
  apolloClient: ApolloClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Who is signed in and how far setup is, for the gates of every route below.
  beforeLoad: async ({ context, location }) => {
    const { me, setup } = await readSession(context.apolloClient);
    // Another browser holds setup: this one sees only that, and only then.
    const heldElsewhere = setup.holder === "ANOTHER_DEVICE";
    if (heldElsewhere !== (location.pathname === SETUP_IN_PROGRESS)) {
      throw redirect({ to: heldElsewhere ? SETUP_IN_PROGRESS : "/", replace: true });
    }
    // The setup holder has no account yet, so sign-in and other pages lead back to setup.
    if (setup.holder === "YOU" && !location.pathname.startsWith("/setup")) {
      throw redirect({ to: setupStepPage(setup.step, setup.mode), replace: true });
    }
    return {
      me: me ?? null,
      holdsSetup: setup.holder === "YOU",
      setupStep: setup.step,
      mode: setup.mode,
    };
  },
  component: Outlet,
  errorComponent: UnreachablePage,
  notFoundComponent: NotFoundPage,
});

const SETUP_IN_PROGRESS = "/setup/in-progress";
