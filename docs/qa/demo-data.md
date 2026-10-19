# QA: Demo data

A manual check that skipping the import fills the demo company and that clearing it keeps real people.

## Setup

1. Start the stack with a fresh development database as in [QA setup](setup.md).
2. Save the company step with a name such as "Acme Corp", then choose "Use demo data" on Setup AI.

## Demo mode

- [ ] `/people` opens without asking for an account and shows 40 people, each with a photo avatar, and the green banner "Demo mode · Create your account within 7 days to keep access." with "Create account".
- [ ] The workspace menu shows "Demo" and "Create account", and no "Sign out".
- [ ] A reload, a new tab and a restart of the stack keep you in the app; none opens setup.
- [ ] "Create account" opens "Create your account"; `owner@example.com` and a password sign you in again on `/people`, and the banner becomes "You’re looking at demo data." with "Clear demo data".
- [ ] Sign out, then sign in with that email and password: the same people are there.

## Seeded

- [ ] Sorting by start date shows two people starting in the coming weeks.
- [ ] The company keeps the name saved in the setup step.
- [ ] The banner shows on every page of the shell, such as `/company`.

## Clear

1. Add a real person with the `employee { create }` mutation (see [QA setup](setup.md) for calling GraphQL).
2. Choose "Clear demo data", then "Cancel": nothing changes.
3. Choose "Clear demo data" again and confirm.

- [ ] While clearing, the button reads "Clearing…" and the dialog cannot be closed.
- [ ] Only the person added in step 1 remains; the banner is gone, also after a reload.
- [ ] A demo avatar URL copied before clearing now answers 404.

## Managed

- [ ] Sign in to a managed instance through the managed flow, save the company step and choose "Skip and use demo data" on the import step: the same 40 people and the banner appear.

## Image

- [ ] Build and run the image (`HOST_WEB_PORT=0 docker compose up --build`): seeding works, and the container holds the 40 avatars and their `NOTICE` under `/app/api/dist/modules/demo/avatars/`.

## Look

- [ ] One batched screenshot round at desktop and narrow width: the list with avatars and the banner, the clear dialog, the list after clearing.
- [ ] The Impeccable detector over the changed web files.
