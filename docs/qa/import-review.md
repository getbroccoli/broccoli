# QA: Review your people

A manual check of the setup review step, between the import and Approve, on a development stack.

## Setup

1. Run `pnpm dev` (and once in the Docker image) with or without `OPENROUTER_API_KEY` and follow the [import step](import-step.md): upload a CSV and, when a Slack workspace is available, connect Slack.
2. Give the CSV over 50 people, one row without an email, one without a start date and one whose name is one word. With Slack, also have one member whose name is one word, members with and without an uploaded profile photo, and give two CSV rows the emails of Slack members, one with a different job title.

## The page

- [ ] "Review your people" opens `/setup/import/review`, titled "Review your people". In the step list, "Add your people" is current with its pages beneath it: "Gather everyone’s details" checked and "Review your people" in a card.
- [ ] "Details came from" lists the Slack workspace and the file, each with its mark; the search field sits at the right of that row.
- [ ] The table lists one row per person, by name: Person (Slack photo or initials, and name), Email, Job title, Start date ("Not set" when missing), Sources, and a menu; its footer reads "N people".
- [ ] The one-word Slack member shows an amber "No last name" pill under the name; the row without an email shows "No valid work email" and its email "Not set" in amber.
- [ ] Someone in both Slack and the file shows once, with both source marks overlapping in Sources; hovering them names the sources.

## Settling values

- [ ] The person whose job title differs shows an amber "2 job titles" pill instead of the title. Clicking it opens "{name} has 2 job titles", "staff.csv and {workspace} disagree. Pick the one to keep." and one button per value with its source.
- [ ] Clicking a value closes the popover, shows it in the cell and a toast "Job title set to …" with Undo; Undo brings the pill back.
- [ ] Clicking any other value, such as an email or a start date, opens "{Field} for {name}" with a field and Save. A bad email shows "Enter a valid email"; a 101-character name "Use 100 characters or fewer". A good value shows in the cell.
- [ ] Typing a last name for the one-word member removes its "No last name" pill and raises the Approve count by one.
- [ ] Typing, for the row without an email, the email of another person shows "Another person has this email. Leave one of them out instead." and changes nothing.
- [ ] "Leave out" in a row's menu dims the row and shows "Left out"; "Add back" undoes it. The Approve count follows.

## Things to check

- [ ] "N things to check" opens a list of kinds: "1 person with different job titles in their sources" with "Use staff.csv for all", "Use {workspace} for all" and "One by one"; "1 person without a work email" with "Leave them out" and "Show them".
- [ ] "Use {workspace} for all" settles every open job-title conflict with Slack's value and the kind disappears.
- [ ] "One by one" narrows the table, with "Showing people with different job titles" and "Show everyone"; once the last one is settled, the line reads "All checked".
- [ ] "Leave them out" leaves out every person without a work email.
- [ ] Back and returning, and a reload, keep every choice; removing the CSV on the import page makes its picks fall back to Slack's values.

## Edge cases

- [ ] Two files with the same email in another case or with spaces (`AVERY@…` and `avery@…`) show one row.
- [ ] Two rows of one file with the same email show one row; its values list that file once.
- [ ] Three files with three job titles show "3 job titles", and the popover reads "Your sources disagree. Pick the one to keep."
- [ ] A value only one source has shows without a pill.
- [ ] A blank typed value, job title and start date included, shows "Enter a value"; typing a person's own current email again is accepted.
- [ ] After a Slack pick, refreshing Slack with a changed value for that member shows the new value, still picked.
- [ ] A left-out person with an email stays left out after their file is removed and uploaded again.
- [ ] Once the toast has closed there is no Undo; clicking the cell again changes the value back. With the network off, Undo shows "Couldn’t save. Try again.", and so does "Leave out".
- [ ] `/setup/import/review?check=bogus` shows an empty table with "All checked" and "Show everyone".
- [ ] At 375 px the value popover and "N things to check" fit the screen.
- [ ] A screen reader reads each value with its field and person, such as "Last name for Madonna: Not set".

## Photos

- [ ] A Slack member with an uploaded profile photo shows it in Person; one on Slack's generated placeholder shows initials, as does everyone from the file only.
- [ ] Changing a member's photo in Slack and choosing "Refresh" shows the new photo.
- [ ] With the network to Slack's photo host blocked, reading Slack still succeeds and those people show initials.
- [ ] A workspace of a few hundred people with photos shows every photo right after the read, which takes only a few seconds longer.

## Search, sort and paging

- [ ] Clicking Person, Email or Start date sorts ascending, then descending; people without a start date stay last both ways. Job title and Source are not sortable.
- [ ] Searching part of a first name, last name or email filters the list and the footer reads "Showing M of N people"; a search without matches shows "No people match “…”" and "Clear search".
- [ ] With over 50 people, "Next page" shows the rest; reload and Back keep the page.
- [ ] `/setup/import/review?sort=bogus&dir=sideways&after=junk` opens the normal list.

## Approve

- [ ] The footer shows "← Back" and "Add N people →", N counting the people neither left out nor with a "Won’t be added" pill; beside it, "L left out.", "M people won’t be added: they are missing a name or work email." and "K values were not checked; the first source’s are used.", each only when it applies.
- [ ] "Back" returns to `/setup/import` with the sources as they were.
- [ ] "Add N people" shows "Adding people…" and lands on `/setup`, "Create your account"; `/setup/import/review` now goes there. Above the form, up to 10 of their initials circle the company's logo, with "N people are in." below; with more than 10, one face changes every few seconds. With reduced motion the ring stands still. Creating the account lands on `/people`, which lists exactly those N people, each once, with the values and photos review showed, and no demo people.
- [ ] With `/setup/import/review` open in two tabs, "Add N people" in both adds each person once.
- [ ] Opened while a file is still read (by its URL, or after "Retry" in another tab), the button reads "Reading your files…" and is disabled; approving from a tab opened before the Retry shows "Couldn’t add your people. Try again." and adds no one.
- [ ] With only incomplete people (for example a Slack workspace of one-word names), "Add N people" is hidden and the footer reads "No one is ready to add. Fix the highlighted details, or go back to add a source."

## Guards

- [ ] In a second browser profile, `/setup/import/review` goes to `/setup/in-progress`.
- [ ] Before the company is named it goes to `/setup/company`; after setup it goes to `/people`.

## Layout

- [ ] At 375 px wide the table scrolls sideways inside its frame with the Person column pinned; the footer's buttons wrap without scrolling the page.
- [ ] Screenshots of the review (desktop and narrow, with incomplete people) go in the pull request description.
