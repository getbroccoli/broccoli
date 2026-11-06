# QA: Employment terms

A manual check of Settings › Employment terms, the list and one set of terms, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com`, open Settings, then "Employment terms" under "Areas", above "Time off".

## The list

- [ ] The page reads "Employment terms" with the line about working weeks and time off rules.
- [ ] One row, "England and Wales" with a "Default" pill and "England and Wales bank holidays" under it.
- [ ] Working week reads "Mon–Fri, 7.5 hours"; Annual leave "28 days incl. bank holidays"; Locations "London, Manchester, Remote"; People "38", the demo's people employed today; two start later.
- [ ] "People without a location start on the default terms." sits under the table.
- [ ] A "New terms" button sits top right.

## One set of terms

- [ ] Clicking the row, or its name with the keyboard, opens the terms over the list at `/settings/terms/<id>`; Close, × and Escape go back to `/settings/terms`.
- [ ] The header reads "England and Wales", "Default", "38 people · London, Manchester, Remote".
- [ ] Working week shows Mon to Fri at "7.5", Sat and Sun "Off", "Hours a week 37.5", "A full day of leave 7.5 hours", "Bank holidays England and Wales".
- [ ] Time off lists Annual leave "From a balance · 28 days a year, bank holidays included · Leave year from 1 January", then Sickness, Family leave and Other "Recorded, doesn't count", each with its icon.
- [ ] Locations shows London, Manchester and Remote as chips without ×, with the line about the default terms.
- [ ] History, on the right, reads "Broccoli set up England and Wales" with "Time off turned on"; a setup the owner finished names the owner.
- [ ] The header has a ⋯ menu with "Rename" and a disabled "Delete England and Wales" reading "The default terms stay, because people without a location start on them."
- [ ] An unknown id, such as `/settings/terms/00000000-0000-4000-8000-000000000001`, reads "These terms could not be found."

## Create, rename and delete

- [ ] "New terms" opens a dialog with Name, its hint, and "Bank holidays" set to the default terms' ones; the footer says it starts with a Mon–Fri week and no time off.
- [ ] Creating with an empty name says "Enter a name."; with 101 characters "Use 100 characters or fewer."; with " england and wales " "There are already terms called England and Wales."
- [ ] Creating "Senior staff" on Scotland bank holidays opens its stack: "0 people", Mon to Fri at "7.5", "Bank holidays Scotland", every type "Not offered here", "No location starts people here yet." and History "Owner set up Senior staff" with "Edited". The list shows it after England and Wales.
- [ ] ⋯ › Rename to "Senior team" updates the header, the list and History; a taken name shows the same error as creating.
- [ ] ⋯ › "Delete Senior team" reads "Nobody was ever on these terms."; choosing it closes the stack, shows "Senior team deleted." and the list no longer shows it.
- [ ] Terms a location starts people on (pick them for London in Settings › Locations) show Delete disabled with "London starts new people here. Choose other terms for it in Settings › Locations first."
- [ ] Terms a person was ever on show Delete disabled with "Terms people were on stay, so their history stays true."
- [ ] With the stack open in one tab, pointing a location at the terms in another tab, then choosing Delete in the first shows the server's reason as a toast and the menu then shows it too.
- [ ] At 390 px wide, the dialogs fit the screen with a gutter and the ⋯ menu opens inside it.

## Planned and not offered

Change the dev database by hand, since no screen changes terms yet: end Annual leave's version on 31 December and add one from 1 January next year with 22 days and bank holidays on top; delete the terms' policy for Other.

- [ ] Annual leave keeps today's line and shows "From 1 Jan <next year>: 22 days a year, bank holidays on top" under it.
- [ ] Other shows a dashed row: "Not offered here. People on England and Wales can't book it."
- [ ] The list's Annual leave still reads today's "28 days incl. bank holidays".

## Before time off is on

Exit the demo, then finish setup with the owner but without the Company defaults step's time off choice (`POST /api/auth/setup` without `timeOff`).

- [ ] The list's Annual leave reads "Not offered".
- [ ] The terms show every type as "Not offered here. People on England and Wales can't book it." and History reads "No changes recorded yet."

## States

- [ ] With the API stopped, reloading the list shows "Employment terms could not be loaded." and "Try again", which reloads it once the API is back.
- [ ] At 390 px wide, the terms fill the screen edge to edge, sections stack, History follows them and Close stays at the bottom; the list scrolls sideways inside its box.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/terms` redirects to People.
