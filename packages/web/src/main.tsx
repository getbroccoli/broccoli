import "./styles.css";

import { ApolloProvider } from "@apollo/client/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createApolloClient } from "./apollo";
import { routeTree } from "./routeTree.gen";

// The client tells the router to re-check the session when the API refuses a request
// for want of one; the gates then send the user to sign in.
const apolloClient = createApolloClient({ onUnauthenticated: () => void router.invalidate() });
const router = createRouter({ routeTree, context: { apolloClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element in index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <ApolloProvider client={apolloClient}>
      <RouterProvider router={router} />
    </ApolloProvider>
  </StrictMode>,
);
