import "./styles.css";

import { ApolloProvider } from "@apollo/client/react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { apolloClient } from "./apollo";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

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
