# QA: Demo data

A manual check that skipping the import fills the demo company and that Exit demo takes setup back to its start.

## Setup

1. Start the stack with a fresh development database as in [QA setup](setup.md).
2. Save the company step with a name such as "Acme Corp", then choose "Explore the demo" on Setup AI.

## Demo mode

- [ ] `/people` opens without asking for an account and shows 40 people, each with a photo avatar, and the green banner "Demo mode · 7 days left" with "Exit demo".
- [ ] The workspace menu shows "Demo" with "Exit demo", and no "Sign out".
- [ ] A reload, a new tab and a restart of the stack keep you in the app; none opens setup.
- [ ] Reading Slack or uploading a file first, then going back and choosing "Use demo data", shows only the 40 demo people.

## Seeded

- [ ] Sorting by start date shows two people starting in the coming weeks.
- [ ] The company keeps the name saved in the setup step.
- [ ] The banner shows on every page of the shell, such as `/company`.

## Exit

1. Add a real person with the `employee { create }` mutation (see [QA setup](setup.md)).
2. Choose "Exit demo" on the banner, then "Cancel": nothing changes. Do the same from the workspace menu.
3. Choose "Exit demo" again and confirm.

- [ ] The dialog reads "Exit demo?" and says the demo people and anyone you added are deleted, and the company and AI choice stay.
- [ ] While exiting, the button reads "Exiting…" and the dialog cannot be closed.
- [ ] You land on `/setup/company` with the company name filled in; Setup AI keeps its choice and "Explore the demo" is offered again.
- [ ] `/people` no longer opens, and a demo avatar URL copied before exiting answers 404.
- [ ] Finishing setup with an import and `owner@example.com` ends on `/people` with only the imported people; the person from step 1 is gone.

## Managed

1. Sign in to a managed instance through the managed flow, save the company step and choose "Explore the demo" on the import step.

- [ ] The same 40 people appear, with the banner "You’re looking at demo data." and "Exit demo".
- [ ] "Exit demo" and confirming lands on `/setup/company`, still signed in, with the company name filled in.

## Image

- [ ] Build and run the image (`HOST_WEB_PORT=0 docker compose up --build`): seeding works, and the container holds the 40 avatars and their `NOTICE` under `/app/api/dist/modules/demo/avatars/`.

## Look

- [ ] One batched screenshot round at desktop and narrow width: the list with avatars and the banner, the exit dialog, the company step after exiting.
- [ ] The Impeccable detector over the changed web files.
