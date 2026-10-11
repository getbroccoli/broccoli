import type { ApolloClient } from "@apollo/client";
import { createRootRouteWithContext, Outlet, redirect } from "@tanstack/react-router";

import { SessionDocument } from "@/__generated__/graphql";
import { NotFoundPage, UnreachablePage } from "@/shell";

export interface RouterContext {
  apolloClient: ApolloClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  // Who is signed in and how far setup is, for the gates of every route below.
  beforeLoad: async ({ context, location }) => {
    const { data } = await context.apolloClient.query({
      query: SessionDocument,
      fetchPolicy: "network-only",
    });
    if (!data) {
      throw new Error("The session query returned no data");
    }
    // A new instance has no owner yet: every page waits for setup.
    if (data.setup.step === "OWNER" && location.pathname !== "/setup") {
      throw redirect({ to: "/setup", replace: true });
    }
    return { me: data.me ?? null, setupStep: data.setup.step };
  },
  component: Outlet,
  errorComponent: UnreachablePage,
  notFoundComponent: NotFoundPage,
});
