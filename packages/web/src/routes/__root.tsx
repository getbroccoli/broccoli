import type { ApolloClient } from "@apollo/client";
import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";

import { readSession } from "@/features/setup";
import { NotFoundPage, UnreachablePage } from "@/shell";

export interface RouterContext {
  apolloClient: ApolloClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Who is signed in and how far setup is, for the gates of every route below.
  beforeLoad: async ({ context, location }) => {
    const { me, setup } = await readSession(context.apolloClient);
    // Another browser holds setup: this one sees only that, never its pages.
    if (setup.holder === "ANOTHER_DEVICE" && location.pathname !== SETUP_IN_PROGRESS) {
      throw redirect({ to: SETUP_IN_PROGRESS, replace: true });
    }
    return {
      me: me ?? null,
      holdsSetup: setup.holder === "YOU",
      setupStep: setup.step,
      signIn: setup.signIn,
    };
  },
  component: Outlet,
  errorComponent: UnreachablePage,
  notFoundComponent: NotFoundPage,
});

const SETUP_IN_PROGRESS = "/setup/in-progress";
