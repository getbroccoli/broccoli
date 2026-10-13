# QA: Import step

A manual check of bringing people in from Slack during setup, on a development stack.

## Setup

1. Run `pnpm dev` and follow [setup](setup.md) up to and including naming the company.
2. Have a Slack workspace with a few members, including a bot and a guest, and an account that may install apps there.

Instances connect through the relay at `SLACK_RELAY_URL`. Without it the Slack row reads "Slack isn’t set up on this server yet." and has no Connect button.

## Connect

- [ ] The page is `/setup/import`, titled "Add your people", with "Setup Company" done and "Add your people" current.
- [ ] The Slack row reads "Import the members of your Slack workspace." with "Connect Slack".
- [ ] "Connect Slack" opens Slack's consent screen for the workspace.
- [ ] Allowing it returns to `/setup/import`; the row reads "<workspace> · N people", where N counts the members with an email, without bots, apps, guests or deactivated accounts.
- [ ] `query { import { sources { name employeeCount } employees { edges { node { firstName lastName email jobTitle } } } } }` lists them with names and titles as in Slack.

## Refresh and reconnect

- [ ] After adding or deactivating a member in Slack, "Refresh" updates the count.
- [ ] "Connect another workspace" goes through Slack again; the row then shows the other workspace and its members.

## Failures

- [ ] Cancelling on Slack's consent screen returns with "Slack wasn’t connected: the request was cancelled."
- [ ] Opening the callback URL from a finished connection again shows "Connecting Slack took too long or started in another browser. Try again."
- [ ] After removing the app from the workspace, "Refresh" shows "Couldn’t read Slack. Try again, or connect Slack again."

## Leaving the step

- [ ] "Skip for now" lands on `/people`; `/setup/import` now goes to `/people`.

## Layout

- [ ] On a narrow window the Slack row and its button fit without scrolling sideways.
- [ ] Screenshots of `/setup/import` (not connected, connected, with an error; desktop and narrow) go in the pull request description.
