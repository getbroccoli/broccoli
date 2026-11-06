# QA: Employment terms

A manual check of Settings › Employment terms, the list and one set of terms, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com`, open Settings, then "Employment terms" under "Areas", above "Time off".

## The list

- [ ] The page reads "Employment terms" with the line about working weeks and time off rules.
- [ ] One row, "England and Wales" with a "Default" pill and "England and Wales bank holidays" under it.
- [ ] Working week reads "Mon–Fri, 7.5 hours"; Annual leave "28 days incl. bank holidays"; Locations "London, Manchester, Remote"; People "40".
- [ ] "People without a location start on the default terms." sits under the table.
- [ ] No "New terms" button and no edit controls.

## One set of terms

- [ ] Clicking the row, or its name with the keyboard, opens the terms over the list at `/settings/terms/<id>`; Close, × and Escape go back to `/settings/terms`.
- [ ] The header reads "England and Wales", "Default", "40 people · London, Manchester, Remote".
- [ ] Working week shows Mon to Fri at "7.5", Sat and Sun "Off", "Hours a week 37.5", "A full day of leave 7.5 hours", "Bank holidays England and Wales".
- [ ] Time off lists Annual leave "From a balance · 28 days a year, bank holidays included · Leave year from 1 January", then Sickness, Family leave and Other "Recorded, doesn't count", each with its icon.
- [ ] Locations shows London, Manchester and Remote as chips without ×, with the line about the default terms.
- [ ] History, on the right, reads "Broccoli added England and Wales with 1 field: Name" with "Company defaults"; a set up by the owner names the owner.
- [ ] No Edit, Add or Offer buttons, no ⋯ menu and no "What changes".
- [ ] An unknown id, such as `/settings/terms/00000000-0000-4000-8000-000000000001`, reads "These terms could not be found."

## Planned and not offered

Change the dev database by hand, since no screen changes terms yet: end Annual leave's version on 31 December and add one from 1 January next year with 22 days and bank holidays on top; delete the terms' policy for Other.

- [ ] Annual leave keeps today's line and shows "From 1 Jan <next year>: 22 days a year, bank holidays on top" under it.
- [ ] Other shows a dashed row: "Not offered here. People on England and Wales can't book it."
- [ ] The list's Annual leave still reads today's "28 days incl. bank holidays".

## States

- [ ] With the API stopped, reloading the list shows "Employment terms could not be loaded." and "Try again", which reloads it once the API is back.
- [ ] At 390 px wide, the terms fill the screen, sections stack, History follows them and Close stays at the bottom; the list scrolls sideways inside its box.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/terms` redirects to People.
