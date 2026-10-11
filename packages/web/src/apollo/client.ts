import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client";

import introspection from "@/__generated__/possible-types";
import { typePolicies } from "@/__generated__/type-policies";

import { unauthenticatedLink } from "./unauthenticated-link";

interface ApolloClientOptions {
  /** Runs after a request was refused for want of a session and the cache was cleared. */
  onUnauthenticated: () => void;
}

export function createApolloClient({ onUnauthenticated }: ApolloClientOptions): ApolloClient {
  return new ApolloClient({
    link: ApolloLink.from([
      unauthenticatedLink(onUnauthenticated),
      new HttpLink({ uri: "/api/graphql" }),
    ]),
    cache: new InMemoryCache({ possibleTypes: introspection.possibleTypes, typePolicies }),
    dataMasking: true,
  });
}
