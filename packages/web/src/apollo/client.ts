import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

import introspection from "@/generated/possible-types";
import { typePolicies } from "@/generated/type-policies";

export const apolloClient = new ApolloClient({
  link: new HttpLink({ uri: "/api/graphql" }),
  cache: new InMemoryCache({ possibleTypes: introspection.possibleTypes, typePolicies }),
  dataMasking: true,
});
