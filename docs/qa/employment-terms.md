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
- [ ] Working week and each offered type have "Edit", each offered type "Stop", and "Add time off type" sits under the list; no "What changes" until a section is open.
- [ ] The header has a ⋯ menu with "Rename", "Clone" and a disabled "Delete England and Wales" reading "The default terms stay, because people without a location start on them."
- [ ] An unknown id, such as `/settings/terms/00000000-0000-4000-8000-000000000001`, reads "These terms could not be found."

## Create, rename, clone and delete

- [ ] "New terms" opens a dialog with Name, its hint, and "Bank holidays" set to the default terms' ones; the footer says it starts with a Mon–Fri week and no time off.
- [ ] Creating with an empty name says "Enter a name."; with 101 characters "Use 100 characters or fewer."; with " england and wales " "There are already terms called England and Wales."
- [ ] Creating "Senior staff" on Scotland bank holidays opens its stack: "0 people", a "Draft" pill by the name and "Publish" in the header, Working week "No working week yet" with the line "Draft Mon–Fri, 7.5 hours, Scotland bank holidays" and "Discard", every type "Not offered here" and History "You created Senior staff". The list shows it after England and Wales with a "Draft" pill and "No working week yet". Opening "New terms" again shows an empty name and the default terms' bank holidays.
- [ ] "Publish" on Senior staff publishes at once, without a dialog: "Changes published for Senior staff.", Mon to Fri at "7.5", no "Draft" pill, and History "You changed the working week to Mon–Fri, 7.5 hours from 1 Jan <this year>".
- [ ] ⋯ › Rename to "Senior team" updates the header, the list and History; a taken name shows the same error as creating.
- [ ] ⋯ › Clone on England and Wales, after planning Annual leave for next leave year, opens "Clone terms" with the name "Copy of England and Wales"; a taken name shows the same error as creating. Cloning opens the new terms: "0 people", no locations, a "Draft" pill, today's working week and each type's rules today as "Draft" lines (the planned change is not copied), and History "owner@example.com created Copy of England and Wales". England and Wales is unchanged. Publishing the clone suggests only the clone and changes nothing on England and Wales.
- [ ] ⋯ › "Delete Senior team" reads "Nobody was ever on these terms."; choosing it closes the stack, shows "Senior team deleted." and the list no longer shows it.
- [ ] Terms London starts people on, chosen in Settings › Locations, show Delete disabled with "London starts new people here. Choose other terms for it in Settings › Locations first."
- [ ] Terms a person was ever on show Delete disabled with "Terms people were on stay, so their history stays true."
- [ ] With the menu open on deletable terms, point London at them in Settings › Locations in another tab, then choose Delete: the server's reason shows as a toast and the menu then shows it too.
- [ ] At 390 px wide, the dialogs fit the screen with a gutter and the ⋯ menu opens inside it.

## Change the working week

- [ ] "Edit" on Working week opens it in place with a dark border: seven hour fields from today's week and "Bank holidays"; no "Applies from" and no "What changes".
- [ ] Set Mon to Thu to 8 and Fri to 0: the hint reads "32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours."; the footer reads "Saving keeps the change unpublished until you publish the terms." beside Cancel and Save.
- [ ] 7.3 hours or all days 0 each show their message and keep Save off.
- [ ] Save shows "Working week saved for England and Wales. Publish the terms to apply it.", today's week unchanged, and under it "Draft Mon–Thu, 8 hours, England and Wales bank holidays" with "Discard"; the header shows a "Draft" pill and "Publish"; History has no new line and nobody's allowance changes.
- [ ] "Edit" again opens the draft's hours; saving again keeps one draft line.
- [ ] "Discard" removes the draft line, shows "Unpublished change discarded." and, with no other draft, the "Draft" pill and "Publish".

## Change a type's rules

- [ ] "Edit" on Annual leave opens it with "Counts", "Allowance" 28, "Bank holidays on top" off and "Leave year From 1 January"; every choice under "Counts" is enabled and there is no "Applies from".
- [ ] Typing 30 shows "Changed: 28 → 30 days" and "Not saved" in the row.
- [ ] 367, 20.3 or an empty allowance shows "Enter a number of days from 0 to 366." and keeps Save off.
- [ ] Save shows "Annual leave saved for England and Wales. Publish the terms to apply it." and the row's line "Draft From a balance · 30 days a year, bank holidays included · Leave year from 1 January" with "Discard"; today's line still reads 28 days.

## Publish

- [ ] With the week and Annual leave saved, "Publish" opens "Publish changes to England and Wales": "Apply to" with England and Wales ticked ("Terms · 40 people"; "Terms · 1 person" for one), "Applies from" as "Today", "1 Jan <this year>", "1 Jan <next year>", "Other date…" on "1 Jan <this year>", and "What changes" with "Working week: Mon–Thu, 8 hours" and "Annual leave: 28 → 30 days", each "From <date>", then the people by name, five at first, then "Show all 40".
- [ ] The footer reads "Publishing applies these from <date> and reaches the 40 people, each with the changes that apply to them. Their allowances are worked out again from that date. Unticked ones keep their current settings."; unticking every row reads "Tick who gets the changes to publish them." and turns Publish off
- [ ] With a draft that changes how a type counts, such as Sickness to Unlimited, "Applies from" offers only "1 Jan <this year>" and "1 Jan <next year>", and the hint reads "How a type counts changes only from the start of a leave year."
- [ ] Publishing from 1 Jan <this year> shows "Changes published for England and Wales.", the new week and 30 days as today's, no "Draft" pill, the list's cells updated, and History "You changed the working week to Mon–Thu, 8 hours from 1 Jan <this year>" and "You changed Annual leave to 30 days a year from 1 Jan <this year>". A person on the terms shows 24 days for the four-day week.
- [ ] Publishing from 1 Jan <next year> keeps today's lines and adds planned lines "From 1 Jan <next year>: …" with "Cancel change".
- [ ] With such a planned change, publishing another draft of the same section from an earlier date says "Replaces the changes planned from 1 Jan <next year>." in "What changes"; afterwards the planned line is gone and History reads "You cancelled the change to … from 1 Jan <next year>" beside the new change.
- [ ] "Cancel change" on a change that started meanwhile, or that another tab cancelled, shows the server's reason, not "Try again".
- [ ] Saving again in another tab after the dialog opened, then publishing, shows "These changes were saved again since you opened them." and nothing changes.

## Cancel a planned change

- [ ] "Cancel change" asks "Cancel this change?" with "Annual leave stays at 28 days a year, bank holidays included, for the 38 people on England and Wales.", "Keep change" and "Cancel change".
- [ ] "Keep change" closes it; "Cancel change" shows "Change cancelled.", removes the planned line and adds "You cancelled the change to Annual leave from 1 Jan <next year>" to History.

## Offer a type

Use terms where a type is not offered, such as new terms.

- [ ] A "Not offered here" row has "Offer", which opens the form filled from the type's default rules in Settings › Time off; Other's is "Doesn't count".
- [ ] The untouched offer can be saved; the row keeps "Not offered here" with a "Draft" line, and its button reads "Edit".
- [ ] Publishing offers it: the row shows its rules and History reads "You offered Other from <date>: Recorded, doesn't count".
- [ ] An offer published from next leave year shows its planned line and no "Offer"; cancelling it brings "Not offered here" and "Offer" back.

## Stop offering a type

- [ ] An offered row without a planned change or draft has "Stop" beside "Edit". Stop saves a draft: the row keeps today's rules with a "Draft" line "Not offered from the date you choose in Publish" and "Discard", no "Edit" or "Stop", and the header shows "Publish".
- [ ] "Discard" removes the draft line and brings "Edit" and "Stop" back.
- [ ] Publish opens on "Today" and offers 1 Jan this year, 1 Jan next year and "Other date…"; "What changes" shows "Family leave: not offered" with "From <date>." and the people it reaches.
- [ ] Publishing from 1 Jan <next year> shows the row's line "Not offered from 1 Jan <next year>" with "Cancel change", and the History line "You stopped offering Family leave from 1 Jan <next year>".
- [ ] "Cancel change" says "Family leave stays offered on <terms>."; confirming removes the line and adds "You cancelled stopping Family leave from 1 Jan <next year>".
- [ ] With someone's approved or pending Family leave booked from the date, Publish is refused with "1 person has this time off type booked from that date."
- [ ] Publishing a stop from today shows "Not offered here" with "Offer" at once; Offer, Save and Publish from today give the type back from today.
- [ ] Edits and offers also open Publish on "Today" with "Other date…"; only a change to how a type counts offers just the leave-year starts.

## Add a type from the terms

- [ ] "Add time off type" under the list opens the Settings › Time off Add dialog.
- [ ] Adding "Study leave" shows its row with the Offer form open; closing the form leaves "Not offered here" and "Offer".
- [ ] Settings › Time off lists Study leave.

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
- [ ] With a section open, the form takes the whole width; at 390 px wide it stacks and the save line wraps beside Cancel and Save. The Publish dialog fits the screen with a gutter and scrolls inside.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/terms` redirects to People.
