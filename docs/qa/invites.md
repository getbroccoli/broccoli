# QA: Invites

A manual check of inviting people from People, by email and by copied link, and of joining from an invite, against a development stack.

## Setup

1. Start the stack and create the owner `owner@example.com` with a password as in [QA setup](setup.md), and add two people, such as `avery@example.com` and `blake@example.com`, as "Add employees" there shows. Demo people cannot be invited.
2. Use a second browser profile, or a private window, for the invited person, so the owner stays signed in.
3. Copied links never show on the page; to read one in a terminal, sign in with `curl -c cookies` and call:

   ```sh
   curl -b cookies -H 'content-type: application/json' "$URL/api/graphql" \
     -d '{"query":"mutation { employee { invite(input: { employeeIds: [\"<employee id>\"], delivery: COPIED_BY_OWNER }) { invites { link } error { __typename } } } }"}'
   ```

## People

- [ ] As the owner, People shows a checkbox on every row, plainly visible without hovering, a "Select this page" checkbox in the header, and a "Sign-in" column: "Not invited" for everyone at first. Demo and joined people can be selected too; the invite dialog lists them as skipped.
- [ ] Clicking a checkbox selects the row without opening the person's panel; the toolbar becomes "N selected", Invite and Clear. Clear empties the selection.
- [ ] Selecting people on two pages keeps both selections.

## Copied links ("No email" in Settings)

- [ ] Save "No email" in Settings before checking copied links; a fresh `pnpm dev` instance already sends through Mailpit.
- [ ] Invite opens "Invite 2 people", lists both under "Gets an invite", and offers Permissions: Employee (checked, fixed) and Admin. There is no note.
- [ ] "Create 2 invite links" shows "2 invite links", one line with the date the links stop working and that they show only now, Copy link per person, "Copy all as a list" and Done. "Copy all as a list" copies "Name: link" lines.
- [ ] The Sign-in column shows "Pending · expires in 7 days" for both.
- [ ] Inviting a pending person again shows "gets a new link; the old one stops working"; afterwards the old link shows "This invite link no longer works".

## By email (SMTP to Mailpit in Settings)

- [ ] On a fresh `pnpm dev` instance, Invite offers email delivery without first visiting Settings.
- [ ] Invite shows the note field, "It goes into every invite." and "Emailed from people@example.com · Change in Settings", and the buttons "Create links to copy" and "Send invite(s)".
- [ ] "Send" closes with "Invite sent"; Mailpit receives "You're invited to Acme Corp on Broccoli" (or "<name> invited you…" when the inviter's account has a name) with the note, a "Join Acme Corp" link to `/invite#…`, the expiry date and, when the inviter has a name, "Questions? Ask <name> directly." It comes from "Acme Corp" <people@example.com>, with no Reply-To.
- [ ] With Resend and a made-up key, the Sign-in column shows "Pending · not sent" after reloading People.
- [ ] "Create links to copy" while email is chosen shows links and emails nothing.

## The person's panel

- [ ] The header shows only name and job title. The Work email card shows the sign-in state beside its label on one line, with a dot (grey, amber, red when not sent or expired, green when joined); only "not sent" or "expired" is spelled out, the expiry shows on hover, and its invite action beside the address: "Send invite" when not invited, a quiet "Resend" while pending, "Resend invite" when not sent or expired, none once joined. Each opens the invite dialog for that person.
- [ ] The ⋯ menu offers "Copy invite link" (opens "Invite link for <name>" with the date it stops working, Copy link and Done) and, while an invite is pending, "Cancel invite".
- [ ] "Cancel invite" shows "Invite cancelled"; the state becomes "Not invited" and the link stops working.
- [ ] History shows "Invited", "Invite cancelled" and "Joined" lines with Sign-in: Not invited → Pending → Joined.

## Joining

- [ ] In the second browser, the link opens "Hi Avery, … Acme Corp" with the email read-only, a password field and "Join Acme Corp"; the address bar drops the `#…`.
- [ ] A 7-character password shows "Use at least 8 characters." and the link still works.
- [ ] Joining lands on the person's own panel; the navigation shows People and Your profile, no Settings, and People has no checkboxes or Sign-in column. Their own first and last name are editable, nothing else.
- [ ] Signing out and in again at `/login` with the new password works.
- [ ] The same link again, a cancelled one, a replaced one and `/invite#nonsense` all show "This invite link no longer works" with "Already joined? Sign in".
- [ ] An expired link shows the same; to expire one, run `update invites set expires_at = now() - interval '1 minute' where accepted_at is null;` in the dev database.
- [ ] On a managed workspace, `/login` shows "Joined by invite?" and the email and password form under the accounts button; an invited person signs in there.

## Removing

- [ ] Removing a person who joined signs them out: their next request in the second browser lands on `/login`.

## Rate limit and logs

- [ ] The 21st lookup within a minute answers 429:

  ```sh
  for i in $(seq 21); do curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' "$URL/api/auth/invite/lookup" -d '{"token":"x"}'; done
  ```

- [ ] The API log shows "Invites created", "Invite email sent", "Invite accepted" and "Invite lookup refused" with ids and reason kinds only, never an email, name, note, token or link.

## Known gap

- While email is "No email", a person who joined and forgets their password has no way back in yet.
