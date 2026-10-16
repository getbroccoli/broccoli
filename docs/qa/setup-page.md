# QA: Setup page for the first owner

A manual check of creating the owner in the browser, on a development stack.

## Setup

1. Run `pnpm dev --drop-db` to start on a database without an owner.
2. Use a fresh browser profile, so no session cookie is left over.

## Routing before setup

- [ ] `/people?q=a`, `/login` and `/nope` each land on `/setup`, without the app's navigation.
- [ ] The sidebar shows "Your workspace", "Setup Workspace" as the current step and "Setup Company" after it.

## Owner form

- [ ] "Next: set up company" stays disabled until the email is filled in and the password has 8 characters.
- [ ] `bad` as the email with an 8-character password shows "Enter a valid email address." after submitting.
- [ ] "Generate" fills a 20-character password, shows it in clear text and says "Save this password in your password manager."
- [ ] "Hide" hides it; "Copy" shows "Copied"; typing brings back "Use at least 8 characters."

## After setup

- [ ] Submitting `owner@example.com` ends on `/setup/company`, with "Setup Workspace" done and "Setup Company" current.
- [ ] `/setup` and `/people` both end on `/setup/company`.
- [ ] In a second browser profile, `/setup` lands on `/login`; signing in ends on `/setup/company`.
- [ ] On a new database, two tabs on `/setup` submitted one after the other: the first ends on `/setup/company`, the second on `/login`.
- [ ] After naming the company (see [QA setup](setup.md)), `/setup/company` goes to `/people`.

## Layout

- [ ] On a narrow window, one bar per step replaces the step list, and nothing scrolls sideways.
- [ ] Screenshots of `/setup` (desktop and narrow; empty, with a generated password, with a field error) and `/setup/company` (desktop and narrow) go in the pull request description.
