# QA: Setup before the owner exists

A manual check of a self-hosted setup held by one browser, with the owner account created last, on a development stack.

## Setup

1. Run `pnpm dev --drop-db` to start on a database without an owner.
2. Use two fresh browser profiles, A and B, so no cookie is left over.

## Holding setup

- [ ] In A, `/people?q=a`, `/login` and `/nope` each land on `/setup/company`, without the app's navigation.
- [ ] The sidebar shows "Your workspace", "Setup Company" as the current step, then "Add your people" and "Create your account".
- [ ] In devtools, A has a `broccoli_setup` cookie: HttpOnly, SameSite Lax, expiring in three days.
- [ ] In B, any path lands on `/setup/in-progress`, titled "Setup is in progress on another device", with the `docker compose down --volumes && docker compose up` command. B sees no company name, step or people, and `/setup/company` goes back to it.
- [ ] Closing and reopening A keeps it on its step.

## Owner form, the last step

Name the company and skip the import in A ([QA setup](setup.md)); A lands on `/setup` with "Setup Company" and "Add your people" done and "Create your account" current.

- [ ] "Create account and finish" stays disabled until the email is filled in and the password has 8 characters.
- [ ] `bad` as the email with an 8-character password shows "Enter a valid email address." after submitting.
- [ ] "Generate" fills a 20-character password, shows it in clear text and says "Save this password in your password manager."
- [ ] "Hide" hides it; "Copy" shows "Copied"; typing brings back "Use at least 8 characters."

## After setup

- [ ] Submitting `owner@acme-corp.example` ends on `/people` with the app's navigation; the `broccoli_setup` cookie is gone.
- [ ] `/setup` and `/setup/company` both end on `/people`.
- [ ] In B, any path now lands on `/login`; signing in as the owner ends on `/people`.

## Starting over

Start setup in A, then restart the dev stack with `pnpm dev --drop-db`.

- [ ] B, reloaded, now holds setup on "Setup Company", and A lands on `/setup/in-progress`.

## Layout

- [ ] On a narrow window, one bar per step replaces the step list, and nothing scrolls sideways.
- [ ] Screenshots of `/setup` (desktop and narrow; empty, with a generated password, with a field error) and `/setup/in-progress` (desktop and narrow) go in the pull request description.
