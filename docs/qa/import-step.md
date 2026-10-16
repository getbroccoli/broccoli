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
- [ ] "Connect another workspace" goes through Slack again; the row then shows the other workspace and its members.

## Failures

- [ ] Cancelling on Slack's consent screen returns with "Slack wasn’t connected: the request was cancelled."
- [ ] Opening the callback URL from a finished connection again shows "Connecting Slack took too long or started in another browser. Try again."
- [ ] After removing the app from the workspace, "Refresh" shows "Couldn’t read Slack. Try again, or connect Slack again."

## Files

On an instance with `OPENROUTER_API_KEY` set, managed or self-hosted. Without it, a self-hosted instance shows no file section.

- [ ] Under the Slack row, "Add your files" shows a dashed area "Drop your files here", the hint "CSV, Excel (.xlsx) or PDF, up to 5 MB per file." and the line saying the AI provider sees the first rows with personal details replaced by placeholders and keeps nothing.
- [ ] Dropping a CSV with a title row above the table, semicolons and day-first start dates shows "Uploading staff.csv…", then a card "staff.csv · Reading columns…", then "N people"; `query { import { employees { edges { node { firstName lastName email jobTitle startDate } } } } }` lists them with the right names, emails, titles and dates.
- [ ] Choosing two files at once adds two cards; "Add more files" adds another.
- [ ] An Excel workbook saved by Excel or LibreOffice, with start dates as date cells and the work email as a formula, shows an Excel icon and reads the same people, emails and dates as the same sheet saved as CSV.
- [ ] A workbook with two sheets laid out differently, a hidden sheet of leavers and a sheet of departments lists the people of both visible sheets and none of the hidden one.
- [ ] A PDF payroll table over three pages with its header repeated on each page, a report title and print date above it, "Seite n von 3" footers and a total row (`datev-repeated-header.pdf` from the eval cases) shows a PDF icon, "Reading columns…", then "9 people", the same people, emails, titles and dates as its CSV twin; no person is named after a header cell, the title, a footer or "Summe".
- [ ] A PDF table over two pages with its header on page one only and a title repeated on each page (`header-once-multpage.pdf`) shows "6 people", the same as its CSV twin; nobody is named after the title.
- [ ] A PDF with four department tables and a cost summary (`department-tables.pdf`) shows "6 people", the same as its CSV twin; nobody is named after a department heading, a cost centre or "Total".
- [ ] A PDF report with a letterhead, an address block, subtotals, a totals note and a "Printed on" footer (`letterhead-totals.pdf`) shows "4 people", the same as its CSV twin; nobody is named after the company, the address, a total or the footer.
- [ ] A German `Personaldaten` PDF with one person per page as `Label: value` lines and the name as "Müller, Anna" (`datev-personaldaten-blocks.pdf` from the eval cases) shows "3 people" with the first and last names split as in its CSV twin; nobody is named after the company title, and page 1 saved alone as its own PDF shows "1 person".
- [ ] A one-person-per-page roster where each block starts with the person's name and everyone has the same job title and location (`same-title-page-blocks.pdf`) shows "3 people", each with the job title "Site Coordinator"; nobody is named after the roster title.
- [ ] A landscape PDF export with two job titles wrapped onto a second line in their cell (`personio-landscape.pdf` from the eval cases) shows "5 people", the same as its CSV twin, with "Senior Customer Experience Manager" and "Workplace and People Experience Specialist" whole; nobody is named "Manager" or "Specialist".
- [ ] A PDF payroll grid with one `Name` column of "Schulz, Eva" values and no email (`name-only-grid.pdf`) shows "4 people" with first and last names split as in its CSV twin; Eva Schulz starts on 3 February 2021, shown in the browser's locale.
- [ ] A BambooHR-style PDF report with US month-first hire dates (`bamboohr-month-first.pdf`) shows "4 people" with the same start dates as its CSV twin, shown in the browser's locale: Lena Hart 14 January 2022, Noor Patel 5 November 2024; no employee number shows.
- [ ] A PDF with a list of person blocks followed by a page of blocks side by side (`blocks-and-columns.pdf` from `packages/api/test/fixtures/pdf/`) shows the red "couldn’t read a table or list of people in it" line; no card appears.
- [ ] A text PDF without a table, and a staff table followed by prose naming other people (`table-plus-prose-refusal.pdf` from `packages/api/test/fixtures/pdf/`), each show one red line "<name>: couldn’t read a table or list of people in it. Export it from your payroll or HR tool as CSV or Excel instead."; no card appears.
- [ ] A scanned PDF, a phone photo saved as PDF, an OCR'd scan, and a text table followed by a scanned page each show one red line "<name>: has pages that are scans or photos. Broccoli reads only PDFs with text. Export the list from your payroll or HR tool as CSV, Excel or PDF instead."; no card appears.
- [ ] A PDF that asks for a password to open shows one red line "<name>: is protected by a password. Save a copy without the password and add that."; no card appears. A PDF with only copy or print restrictions (owner password) imports its people like any text PDF.
- [ ] A text table with a small logo, and a one-person table over a full-page letterhead image, import their people.
- [ ] A `.xls` file, a `.docx` renamed to `.pdf`, an empty `.csv`, a workbook of 11 sheets and a file over 5 MB each show one red line naming the file and the reason; no card appears.
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
