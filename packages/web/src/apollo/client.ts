import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client";

import introspection from "@/__generated__/possible-types";
import { typePolicies } from "@/__generated__/type-policies";

import { unauthenticatedLink } from "./unauthenticatedLink";

// The review refetches these lists whole after every choice: replacing them is intended, not data loss.
const REPLACED_LISTS = {
  Import: { fields: { sources: { merge: false }, checks: { merge: false } } },
  ImportEmployee: { fields: { records: { merge: false } } },
};

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
    cache: new InMemoryCache({
      possibleTypes: introspection.possibleTypes,
      typePolicies: { ...typePolicies, ...REPLACED_LISTS },
    }),
    dataMasking: true,
  });
}
