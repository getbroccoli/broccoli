# QA: Import step

A manual check of bringing people in from Slack during setup, on a development stack.

## Setup

1. Run `pnpm dev` and follow [setup](setup.md) up to and including naming the company.
2. Have a Slack workspace with a few members, including a bot and a guest, and an account that may install apps there.

Instances connect through the relay at `SLACK_RELAY_URL`; the default needs no setting.

## Connect

- [ ] The page is `/setup/import`, titled "Add your people", with "Setup Company" done and "Add your people" current.
- [ ] The Slack row reads "Import the members of your Slack workspace." with "Connect Slack".
- [ ] "Connect Slack" opens Slack's consent screen for the workspace.
- [ ] Allowing it returns to `/setup/import`, which imports the members by itself: the row shows "Importing…", then "<workspace> · N people" with "Refresh", where N counts the members with an email, without bots, apps, guests or deactivated accounts.
- [ ] `query { import { sources { name employeeCount } employees { edges { node { firstName lastName email jobTitle } } } } }` lists them with names and titles as in Slack.

- [ ] If that first import fails, the row shows the error and an "Import members" button that tries again.

## Refresh and reconnect

- [ ] After adding or deactivating a member in Slack, "Refresh" updates the count.
- [ ] "Connect another workspace", in the Slack row's "⋯" menu, goes through Slack again; the row then shows the other workspace and its members.

## Failures

- [ ] Cancelling on Slack's consent screen returns with "Slack wasn’t connected: the request was cancelled."
- [ ] Opening the callback URL from a finished connection again shows "Connecting Slack took too long or started in another browser. Try again."
- [ ] After removing the app from the workspace, "Refresh" shows "Couldn’t read Slack. Try again, or connect Slack again."

## Files

On an instance with `OPENROUTER_API_KEY` set, managed or self-hosted. Without it, a self-hosted instance shows no file section.

- [ ] Under the Slack row, "Add your files" shows a dashed area "Drop your files here", the hint "CSV or Excel (.xlsx), up to 5 MB per file." and the line saying the AI provider sees the first rows with personal details replaced by placeholders and keeps nothing.
- [ ] Dropping a CSV with a title row above the table, semicolons and day-first start dates shows "Uploading staff.csv…", then a card "staff.csv · Reading columns…", then "N people"; `query { import { employees { edges { node { firstName lastName email jobTitle startDate } } } } }` lists them with the right names, emails, titles and dates.
- [ ] Choosing two files at once adds two cards; "Add more files" adds another.
- [ ] An Excel workbook saved by Excel or LibreOffice, with start dates as date cells and the work email as a formula, shows an Excel icon and reads the same people, emails and dates as the same sheet saved as CSV.
- [ ] A workbook with two sheets laid out differently, a hidden sheet of leavers and a sheet of departments lists the people of both visible sheets and none of the hidden one.
- [ ] A `.xls` file, a `.pdf` renamed to `.xlsx`, an empty `.csv`, a workbook of 11 sheets and a file over 5 MB each show one red line naming the file and the reason; no card appears.
- [ ] A CSV without a name or email column ends as "Couldn’t find a name or email column." with "Retry".
- [ ] "Remove" in a card's menu removes the card and its people.
- [ ] While a card reads "Reading columns…", the footer's button reads "Reading your files…" and is disabled; afterwards it reads "Next: review your people" again.

## Leaving the step

- [ ] Before Slack is imported, the footer shows only "Skip for now".
- [ ] With members imported, the footer shows "Skip for now" and "Next: review your people", which opens the [review](import-review.md).
- [ ] On a fresh instance, "Skip for now" lands on `/people` with the demo people.

## Layout

- [ ] On a narrow window the Slack row and its button fit without scrolling sideways.
- [ ] Screenshots of `/setup/import` (not connected, connected, with an error, with files; desktop and narrow) go in the pull request description.
