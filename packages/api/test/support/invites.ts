import assert from "node:assert/strict";

import type { Browser } from "./browser";

/** Creates a copied invite through GraphQL and returns its token. */
export async function copyInvite(
  browser: Browser,
  employeeId: string,
  profiles: "ADMIN"[] = [],
): Promise<string> {
  const response = await browser.graphql(INVITE_EMPLOYEES, {
    input: { employeeIds: [employeeId], profiles, delivery: "COPIED_BY_OWNER" },
  });
  const body = (await response.json()) as {
    data: {
      employee: { invite: { error: unknown; invites: { link: string; delivery: string }[] } };
    };
  };
  assert.equal(body.data.employee.invite.error, null);
  const sent = body.data.employee.invite.invites;
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.delivery, "COPIED_BY_OWNER");
  const link = new URL(sent[0]!.link);
  assert.equal(link.pathname, "/invite");
  assert.match(link.hash, /^#[A-Za-z0-9_-]{43}$/);
  return link.hash.slice(1);
}

export const INVITE_EMPLOYEES = `mutation Invite($input: InviteSendInput!) {
  employee { invite(input: $input) {
    invites { employee { id signInStatus { state expiresAt notSent emailHasAccount } } expiresAt delivery link }
    error { __typename ... on InvalidInputError { fields { field code } } }
  } }
}`;

export const CANCEL_INVITE = `mutation CancelInvite($input: InviteCancelInput!) {
  employee { cancelInvite(input: $input) {
    employee { id signInStatus { state } }
    error { __typename }
  } }
}`;
