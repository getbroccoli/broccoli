import type { ApolloCache } from "@apollo/client";

import type { InviteEmployeesMutation } from "@/__generated__/graphql";
import { addHistoryLine } from "@/features/records";

type SentInvite = NonNullable<InviteEmployeesMutation["employee"]["invite"]["invites"]>[number];

/** Shows each new invite's line in its person's history, as an open panel caches it. */
export function addInviteHistoryLines(cache: ApolloCache, invites: readonly SentInvite[]): void {
  for (const { employee, historyLine } of invites) {
    addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: employee.id, line: historyLine });
  }
}
