import type { ApolloClient } from "@apollo/client";

import { SessionDocument, type SessionQuery } from "@/__generated__/graphql";

import { startSetup } from "./setupApi";

/** Whether this page load renewed the setup session already. */
let renewedSetup = false;

/** Who the last session read said the browser is, and with which profiles; unset before the first. */
let lastIdentity: string | undefined;

/**
 * Who is signed in and how far setup is. Before the owner of a self-hosted instance
 * exists, it first starts setup in this browser when nobody holds it, and renews it
 * once per page load for the browser holding it, so a holder at work never expires.
 */
export async function readSession(apolloClient: ApolloClient): Promise<SessionQuery> {
  const session = await querySession(apolloClient);
  const { me, setup } = session;
  const beforeOwner = setup.mode === "SELF_HOSTED" && setup.step !== "DONE" && !me;
  const shouldStart = setup.holder === "NOBODY" || (setup.holder === "YOU" && !renewedSetup);
  if (!beforeOwner || !shouldStart) {
    return session;
  }
  renewedSetup = await startSetup();
  return querySession(apolloClient);
}

/**
 * The session from the API. When whom it is, whom it acts as or their profiles changed since the
 * last read (in another tab, or on the server), the cache is cleared and the session read again,
 * so nothing loaded for one person shows as another; that rare change costs a second request.
 */
async function querySession(apolloClient: ApolloClient): Promise<SessionQuery> {
  const session = await fetchSession(apolloClient);
  const identity = identityOf(session);
  const changed = lastIdentity !== undefined && lastIdentity !== identity;
  lastIdentity = identity;
  if (!changed) {
    return session;
  }
  await apolloClient.clearStore();
  return fetchSession(apolloClient);
}

async function fetchSession(apolloClient: ApolloClient): Promise<SessionQuery> {
  const { data } = await apolloClient.query({
    query: SessionDocument,
    fetchPolicy: "network-only",
  });
  if (!data) {
    throw new Error("The session query returned no data");
  }
  return data;
}

function identityOf({ me }: SessionQuery): string {
  return JSON.stringify([me?.id, me?.actingAs?.id, me?.permissionProfiles]);
}
