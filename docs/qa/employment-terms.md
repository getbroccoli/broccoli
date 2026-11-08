# QA: Employment terms

A manual check of Settings › Employment terms, the list and one set of terms, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com`, open Settings, then "Employment terms" under "Areas", above "Time off".

## The list

- [ ] The page reads "Employment terms" with the line about working weeks and time off rules.
- [ ] One row, "England and Wales" with a "Default" pill and "England and Wales bank holidays" under it.
- [ ] Working week reads "Mon–Fri, 7.5 hours"; Annual leave "28 days incl. bank holidays"; People "38", the demo's people employed today; two start later.
- [ ] "People without a location start on the default terms." sits under the table.
- [ ] A "New terms" button sits top right.

## One set of terms

- [ ] Clicking the row, or its name with the keyboard, opens the terms over the list at `/settings/terms/<id>`; Close, × and Escape go back to `/settings/terms`.
- [ ] The header reads "England and Wales", "Default", "38 people"; no locations show anywhere on the terms.
- [ ] Working week shows Mon to Fri at "7.5", Sat and Sun "Off", "Hours a week 37.5", "Bank holidays England and Wales".
- [ ] Time off lists Annual leave "From a balance · 28 days a year, bank holidays included · Leave year from 1 January", then Sickness, Family leave and Other "Recorded, doesn't count", each with its icon.
- [ ] History, below the sections as on a person's panel, reads "Broccoli set up England and Wales" with "Time off turned on"; a setup the owner finished names the owner.
- [ ] Working week and each offered type have "Edit"; no "Add time off type", and no "What changes" until a section is open.
- [ ] The header has a ⋯ menu with "Rename" and a disabled "Delete England and Wales" reading "The default terms stay, because people without a location start on them."
- [ ] An unknown id, such as `/settings/terms/00000000-0000-4000-8000-000000000001`, reads "These terms could not be found."

## Create, rename and delete

- [ ] "New terms" opens a dialog with Name, its hint, and "Bank holidays" set to the default terms' ones; the footer says it starts with a Mon–Fri week and no time off.
- [ ] Creating with an empty name says "Enter a name."; with 101 characters "Use 100 characters or fewer."; with " england and wales " "There are already terms called England and Wales."
- [ ] Creating "Senior staff" on Scotland bank holidays opens its stack: "0 people", Mon to Fri at "7.5", "Bank holidays Scotland", every type "Not offered here" and History "owner@example.com created Senior staff" with "Edited". The list shows it after England and Wales. Opening "New terms" again shows an empty name and the default terms' bank holidays.
- [ ] ⋯ › Rename to "Senior team" updates the header, the list and History; a taken name shows the same error as creating.
- [ ] ⋯ › "Delete Senior team" reads "Nobody was ever on these terms."; choosing it closes the stack, shows "Senior team deleted." and the list no longer shows it.
- [ ] Terms London starts people on, chosen in Settings › Locations, show Delete disabled with "London starts new people here. Choose other terms for it in Settings › Locations first."
- [ ] Terms a person was ever on show Delete disabled with "Terms people were on stay, so their history stays true."
- [ ] With the menu open on deletable terms, point London at them in Settings › Locations in another tab, then choose Delete: the server's reason shows as a toast and the menu then shows it too.
- [ ] At 390 px wide, the dialogs fit the screen with a gutter and the ⋯ menu opens inside it.

## Change the working week

- [ ] "Edit" on Working week opens it in place with a dark border: seven hour fields from today's week, "Bank holidays" and "Applies from" as one row "Today", "1 Jan <next year>", "Other date…", on "Today".
- [ ] Set Mon to Thu to 8 and Fri to 0: the hint reads "32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours.", "What changes" shows "Working week: Mon–Thu, 8 hours" with "From <today>." and the people by name, five at first, then "Show all 40".
- [ ] The footer reads "Saving changes the working week for the 40 people on England and Wales, from <today>. Their allowances are worked out again from that date." beside Cancel and Save.
- [ ] 7.3 hours or all days 0 each show their message and keep Save off; days before 1 January this year can't be picked.
- [ ] Save shows "Working week saved for England and Wales." and the new week; History reads "You changed the working week to Mon–Thu, 8 hours", with no "Edited" label.
- [ ] A week from a later date shows under today's as "From <date>: …" with "Cancel change"; the toast adds "It changes on <date>."

## Change a type's rules

- [ ] "Edit" on Annual leave opens it with "Counts", "Allowance" 28, "Bank holidays on top" off, "Leave year From 1 January" and "Applies from" as one row "1 Jan <this year>", "1 Jan <next year>", "Other date…", on "1 Jan <this year>" with "This leave year, so <this year> allowances change now."
- [ ] Typing 30 shows "Changed: 28 → 30 days" and "Not saved" in the row, and "Annual leave: 28 → 30 days" with "From 1 Jan <year>, bank holidays still included" in "What changes".
- [ ] "Other date…" shows a date field; with a date off 1 January, Unlimited and Doesn't count are disabled and the counts keep today's.
- [ ] 367, 20.3 or an empty allowance shows "Enter a number of days from 0 to 366." and keeps Save off.
- [ ] Saving from next leave year shows "Annual leave saved for England and Wales. It changes on 1 Jan <next year>.", the planned line with "Cancel change", and the History line "You changed Annual leave to 30 days a year from 1 Jan <next year>".
- [ ] Saving from this leave year's start changes today's line, and the list's Annual leave cell.
- [ ] Changing Sickness to Unlimited from this leave year's start reads "Unlimited · Leave year from 1 January".

## Cancel a planned change

- [ ] "Cancel change" asks "Cancel this change?" with "Annual leave stays at 28 days a year, bank holidays included, for the 38 people on England and Wales.", "Keep change" and "Cancel change".
- [ ] "Keep change" closes it; "Cancel change" shows "Change cancelled.", removes the planned line and adds "You cancelled the change to Annual leave from 1 Jan <next year>" to History.

## Offer a type

Every type is offered on the demo terms. For a type that is not, delete the terms' policy for Other in the dev database, or use the terms from "Before time off is on" below.

- [ ] A "Not offered here" row has "Offer", which opens the form filled from the type's default rules in Settings › Time off, with every choice enabled; Other's is "Doesn't count".
- [ ] The untouched offer already shows "What changes" and can be saved.
- [ ] With "Doesn't count" chosen, "What changes" reads "Other: offered, Recorded, doesn't count" and "Saving offers Other to the 38 people on England and Wales, from 1 January <this year>."
- [ ] Saving shows the row as offered and History reads "You offered Other from 1 Jan <this year>: Recorded, doesn't count".
- [ ] An offer from next leave year shows its planned line and no "Offer"; cancelling it brings "Not offered here" and "Offer" back.

## One section at a time

- [ ] With unsaved changes in one section, "Edit" on another asks "Discard your changes?"; "Keep editing" stays, "Discard" opens the other.
- [ ] Cancel in the footer closes the section without saving.

## Before time off is on

Exit the demo, then finish setup with the owner but without the Company defaults step's time off choice (`POST /api/auth/setup` without `timeOff`).

- [ ] The list's Annual leave reads "Not offered".
- [ ] The terms show every type as "Not offered here. People on England and Wales can't book it." and History reads "No changes recorded yet."

## States

- [ ] With the API stopped, reloading the list shows "Employment terms could not be loaded." and "Try again", which reloads it once the API is back.
- [ ] At 390 px wide, the terms fill the screen edge to edge, History follows the sections and Close stays at the bottom; the list scrolls sideways inside its box.
- [ ] With a section open, "What changes" appears on the right; at 390 px wide it sits below History, the form stacks and the save line wraps beside Cancel and Save.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/terms` redirects to People.
