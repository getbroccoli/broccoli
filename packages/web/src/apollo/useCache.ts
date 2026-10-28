// eslint-disable-next-line no-restricted-imports -- This hook exposes only the client's cache.
import { useApolloClient } from "@apollo/client/react";

export function useCache() {
  return useApolloClient().cache;
}
