import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

import introspection from "@/__generated__/possible-types";
import { typePolicies } from "@/__generated__/type-policies";

export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri: "/api/graphql" }),
  cache: new InMemoryCache({ possibleTypes: introspection.possibleTypes, typePolicies }),
  dataMasking: true,
});
