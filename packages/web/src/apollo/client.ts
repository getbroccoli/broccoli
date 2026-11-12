import {
  ApolloClient,
  ApolloLink,
  type FieldReadFunction,
  HttpLink,
  InMemoryCache,
  type StoreObject,
  type TypePolicies,
} from "@apollo/client";

import introspection from "@/__generated__/possible-types";
import { connectionTypes, typePolicies } from "@/__generated__/type-policies";

import { unauthenticatedLink } from "./unauthenticatedLink";

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
      typePolicies: withLiveEdges({
        ...typePolicies,
        // A value has no id, so a query naming only some of its fields, such as a manager's name,
        // must add to the value review holds rather than replace it.
        ImportEmployeeValue: { merge: true },
        // A person's terms have no id; the panel names their periods and its tab the rest.
        EmployeeEmploymentTerms: { merge: true },
        Query: {
          fields: {
            // Closing is for good, so a read sent before the close can't reopen the invitation.
            agentInvitationClosed: {
              merge: (existing: boolean | undefined, incoming: boolean) =>
                existing === true || incoming,
            },
          },
        },
      }),
    }),
    dataMasking: true,
  });
}

/**
 * Every connection reads its edges without those whose node was evicted, such as a deleted
 * record, so evicting a record removes it from every cached list without a refetch.
 */
function withLiveEdges(policies: TypePolicies): TypePolicies {
  return {
    ...policies,
    ...Object.fromEntries(
      connectionTypes.map((name) => [
        name,
        { ...policies[name], fields: { edges: { read: liveEdges } } },
      ]),
    ),
  };
}

const liveEdges: FieldReadFunction<readonly StoreObject[]> = (edges, { canRead, readField }) =>
  edges?.filter((edge) => canRead(readField("node", edge)));
