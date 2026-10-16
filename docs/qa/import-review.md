# QA: Review your people

A manual check of the setup review step, between the import and Approve, on a development stack.

## Setup

1. Run `pnpm dev` (and once in the Docker image) with `OPENROUTER_API_KEY` set and follow the [import step](import-step.md): upload a CSV and, when a Slack workspace is available, connect Slack.
2. Give the CSV over 50 people, one row without an email, one without a start date and one whose name is one word. With Slack, also have one member whose name is one word.

## The page

- [ ] "Next: review your people" opens `/setup/import/review`, titled "Review your people". In the step list, "Add your people" is current with its pages beneath it: "Gather everyone’s details" checked and "Review your people" in a card.
- [ ] "Details came from" lists the Slack workspace and the file, each with its mark; the search field sits at the right of that row.
- [ ] The table lists every person of every source, one row per source, by name: Person (initials and name), Email, Job title, Start date ("Not set" when missing), Source; its footer reads "N people".
- [ ] The one-word Slack member shows an amber "No last name" pill under the name; the row without an email shows "No valid work email" and its email "Not set" in amber.
- [ ] Someone in both Slack and the file shows twice, once per source.

## Search, sort and paging

- [ ] Clicking Person, Email or Start date sorts ascending, then descending; people without a start date stay last both ways. Job title and Source are not sortable.
- [ ] Searching part of a first name, last name or email filters the list and the footer reads "Showing M of N people"; a search without matches shows "No people match “…”" and "Clear search".
- [ ] With over 50 people, "Next page" shows the rest; reload and Back keep the page.
- [ ] `/setup/import/review?sort=bogus&dir=sideways&after=junk` opens the normal list.

## Approve

- [ ] The footer shows "← Back" and "Approve N people", N counting the people without a "Won’t be added" line; beside it, "M people won’t be added: they are missing a name or work email."
- [ ] "Back" returns to `/setup/import` with the sources as they were.
- [ ] "Approve N people" shows "Approving…" and lands on `/people`, which lists exactly those N people and no demo people; `/setup/import/review` now goes to `/people`.
- [ ] With `/setup/import/review` open in two tabs, "Approve" in both adds each person once.
- [ ] Opened while a file is still read (by its URL, or after "Retry" in another tab), Approve reads "Reading your files…" and is disabled; approving from a tab opened before the Retry shows "Couldn’t add your people. Try again." and adds no one.
- [ ] With only incomplete people (for example a Slack workspace of one-word names), Approve is hidden and the footer reads "No one is ready to add. Go back to add a source, or skip for now."

## Guards

- [ ] Signed out, `/setup/import/review` goes to sign-in and back.
- [ ] Before the company is named it goes to `/setup/company`; after setup it goes to `/people`.

## Layout

- [ ] At 375 px wide the table scrolls sideways inside its frame with the Person column pinned; the footer's buttons wrap without scrolling the page.
- [ ] Screenshots of the review (desktop and narrow, with incomplete people) go in the pull request description.
