# QA: Import step

A manual check of bringing people in from Slack during setup, on a development stack.

## Setup

1. Run `pnpm dev` and follow [setup](setup.md) up to and including naming the company.
2. Have a Slack workspace with a few members, including a bot and a guest, and an account that may install apps there.

Instances connect through the relay at `SLACK_RELAY_URL`; the default needs no setting.

## Connect

- [ ] The page is `/setup/import`, titled "Add your people", with "Setup Company" (and, self-hosted, "Setup AI") done and "Add your people" current.
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

On any instance. A self-hosted one without `OPENROUTER_API_KEY` reads files through Broccoli AI; run the list once each way.

- [ ] Under the Slack row, "Add your files" shows a dashed area "Drop your files here", the hint "CSV, Excel (.xlsx) or PDF, up to 5 MB per file." and the line saying the AI provider sees the first rows with personal details replaced by placeholders, unless you let it read a file, and keeps nothing.
- [ ] Dropping a CSV with a title row above the table, semicolons and day-first start dates shows "Uploading staff.csv…", then a card "staff.csv · Reading columns…", then "N people"; `query { import { employees { edges { node { firstName lastName email jobTitle startDate } } } } }` lists them with the right names, emails, titles and dates.
- [ ] Choosing two files at once adds two cards; "Add more files" adds another.
- [ ] An Excel workbook saved by Excel or LibreOffice, with start dates as date cells and the work email as a formula, shows an Excel icon and reads the same people, emails and dates as the same sheet saved as CSV.
- [ ] A workbook with two sheets laid out differently, a hidden sheet of leavers and a sheet of departments lists the people of both visible sheets and none of the hidden one.
- [ ] A `.xls` file, a `.pdf` renamed to `.xlsx`, an empty `.csv`, a workbook of 11 sheets and a file over 5 MB each show one red line naming the file and the reason; no card appears.
- [ ] A CSV without a name or email column ends as an amber card "Couldn’t map it from masked rows" with "Retry", the text that AI can read the original file instead and where its personal details go, and "Read the original file".
- [ ] When Broccoli AI refuses (its free period is over), the card shows the refusal's own words with "Retry".
- [ ] "Remove" in a card's menu removes the card and its people.
- [ ] While a card reads "Reading columns…", the footer's button reads "Reading your files…" and is disabled; afterwards it reads "Review your people" again.

## Reading the original file

With Broccoli AI, then again with OpenRouter, on a self-hosted instance:

- [ ] A dropped PDF shows a plain card "Masked reading of PDFs isn’t supported yet" with the consent text naming where its personal details go and "Read the original file"; "Review your people" stays available.
- [ ] "Read the original file" on the PDF shows "Reading the original file…", then "N people · Read by Broccoli AI, not masked" (OpenRouter: "· Read by OpenRouter, not masked"); the people show in review.
- [ ] A mapped CSV's menu shows "Read the original file" with "If the mapping looks wrong. Its personal data goes to …" above "Remove"; choosing it reads the file again in full and its people replace the mapped ones. The menu then shows only "Remove".
- [ ] A PDF too long for the model ends as "This file is too long to read in full."
- [ ] A `.csv` holding a PDF is still refused as not a CSV, Excel or PDF file.
- [ ] After "Add N people" and Reset setup, the file's menu offers "Read the original file" again.

## Leaving the step

- [ ] Before Slack is imported, the footer shows only "Explore the demo"; self-hosted also shows "Back" on the left, which opens `/setup/ai`. Managed shows no "Back".
- [ ] Pressing Enter on the page never starts the demo.
- [ ] With members imported, "Explore the demo" is disabled and hovering it shows "Not available once you’ve gathered people.", and "Review your people" opens the [review](import-review.md).
- [ ] On a fresh instance, "Explore the demo" shows "Opening the demo…" and opens `/people` with the demo people (self-hosted: signed in as the demo's owner, without an account).

## Layout

- [ ] At 320px wide the Slack row fits without scrolling sideways, and its text never runs under the buttons, which move to their own line when connected, importing or failed.
- [ ] Screenshots of `/setup/import` (not connected, connected, with an error, with files; desktop and narrow) go in the pull request description.

## Your own agent

With "Your agent" chosen on Setup AI:

- [ ] "Add your files" shows "Connect your agent" with the prompt on a dark block and a copy button, and no drop zone.
- [ ] Once an agent connects with that prompt, a pill beside "Add your files" names it, with Disconnect in its menu, and the drop zone shows.
- [ ] While the agent waits for files, a dropped file reads "Your agent is picking it up…" at once, with no card, and gets mapped.
- [ ] With the agent stopped for over 30 seconds, a dropped file shows "Waiting for your agent" and a card with "Broccoli has new files. Map them and send their people back."; once the agent picks it up, the card goes.
- [ ] A dropped PDF shows "Masked reading of PDFs isn’t supported yet" and "Read the original file", saying its personal details go to your agent's model provider; the agent does not see it.
- [ ] After "Read the original file", the listening agent fetches it ("Your agent is reading it…") and sends its people: "N people · Read by your agent, not masked".
- [ ] A CSV the agent mapped can be read again in full from its menu; the agent's new people replace the mapped ones.
