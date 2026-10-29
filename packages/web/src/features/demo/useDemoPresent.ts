import { useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";

import { DemoDataDocument } from "@/__generated__/graphql";

export function useDemoPresent() {
  const { demoExpiresAt } = useRouteContext({ from: "/_authenticated" });
  const { data } = useQuery(DemoDataDocument, { skip: demoExpiresAt !== null });
  return demoExpiresAt !== null || data?.demo.isPresent;
}
