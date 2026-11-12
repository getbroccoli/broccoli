# QA: A person's panel

A manual check of opening a person from People, their tabs, editing them in place, their history and removing them, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open `/people`.

## Open and close

- [ ] Clicking anywhere in a row opens that person's panel over the list; the URL becomes `/people/<id>` and keeps the list's search and sort.
- [ ] Tab to a name and press Enter: the same panel opens.
- [ ] The panel shows the avatar, name and job title, then the tabs Overview and History, on Overview: Start date, Tenure ("2 yrs 1 mo", "Starts in 3 days" for a future start) and Work email; Time off; Details in Job and Personal.
- [ ] Choosing History adds `?tab=history` to the URL; reloading keeps History open; Overview removes it again. Closing the panel leaves no tab in the People URL.
- [ ] Close (×), Escape and the browser Back button close the panel and return to the same list.
- [ ] Reloading `/people/<id>` opens the panel again; an unknown id shows "This person doesn’t exist." with Back to People.

## Edit in place

- [ ] Hovering a value shows a pencil; clicking it (or Enter on it) turns it into a text field, or a date picker for Start date.
- [ ] The work email is edited in the Work email card at the top, which keeps its sign-in status and Invite button; an employee viewing their own panel sees it without a pencil.
- [ ] Editing two fields marks each with a green bar; the bar at the bottom says "2 unsaved changes · <fields in panel order> · saved as one history entry".
- [ ] Changing a field back to its saved value removes its mark; Escape inside a field reverts only that field; Cancel reverts everything and hides the bar.
- [ ] "Add reason" turns into one optional field; Save with a reason adds one history line "updated 2 fields: …" with the reason and no cause label; expanding it shows each old → new value.
- [ ] Save of one field reads "changed job title <old> → <new>"; clearing a job title reads "cleared job title <old>" with the old value struck through.
- [ ] The People row shows the new values after Save.
- [ ] Clearing the first name, or entering an email another person has, keeps the field open with "Enter a value." or "Another person has this email." and saves nothing; typing a correction keeps the field open.

## Manager

- [ ] Job shows Manager under Job title: "—" without one, else the manager's name.
- [ ] Clicking it opens a popover with "Find a person…", "None" and up to 8 people with photo and job title, never the person themselves; the current choice has a tick. Typing filters by name or email, hides "None", and Enter picks the first match once results show (a search with no match picks nothing); arrow keys and Enter, or a click, pick one; Escape reverts; a click outside keeps the choice.
- [ ] Save adds "You set manager to <name>", then "changed manager <old> → <new>"; picking "None" and saving reads "cleared manager <old>".
- [ ] Picking someone who reports to them (directly or through others) keeps the field open with "The person you chose already reports to them, so they can’t be their manager." and saves nothing.
- [ ] Removing a manager clears Manager on each of their reports; opening a report (without reloading) shows "cleared manager <name>" with "Manager removed" in their history.

## Location

- [ ] Job shows Location under Job title: "—" without one, else the location's name.
- [ ] As the owner, clicking it opens a menu of the locations Settings lists and "No location"; picking one and saving adds "set location to <name>", then "changed location <old> → <new>"; "No location" reads "cleared location <old>".
- [ ] Renaming the location in Settings shows the new name on the panel; the history lines keep the old name.
- [ ] Signed in as an employee who is not an admin, the location shows on any person's panel but cannot be edited, not even on their reports' panels.

## Leaving with unsaved changes

- [ ] With unsaved changes, Close, Escape or Back asks "Discard N unsaved changes?"; Keep editing stays, Discard leaves without saving.
- [ ] With unsaved changes, choosing History asks the same; Discard opens History and Overview shows the saved values.
- [ ] Reloading or closing the tab with unsaved changes shows the browser's own leave prompt.

## History

- [ ] The History tab shows the chips All, Employment terms and Details, All chosen, and no "History" label.
- [ ] Lines are newest first, grouped "Today", "Yesterday", "21 Oct"; each has the author (the owner's email, or "Broccoli" for the demo), the tag "Details" (or "Employment terms" for a working week change), the cause and the time.
- [ ] Employment terms adds `changes=employmentTerms` and shows only such lines, or "No changes of this kind yet."; Details shows the other lines. A change saved on Overview shows under Details when History opens.
- [ ] The demo person's first line is "Broccoli added <first name> with 5 fields: …" with "Demo".
- [ ] With more than 50 lines, "Show older changes" loads the rest.

## Employment terms

- [ ] Details › Job ends with "Employment terms: England and Wales"; choosing it opens the Employment terms tab (`?tab=terms`).
- [ ] The tab shows "England and Wales" (a link to its settings for the owner) and "since they started"; Working week "Mon–Fri, 7.5 hours" with "England and Wales bank holidays"; each time off type with its icon and rules, such as "28 days a year, bank holidays included" or "Recorded, doesn't count"; each row "from England and Wales"; and "Leave years start on 1 January."
- [ ] Planning England and Wales's working week from next year in Settings adds "From 1 Jan <next year>: Mon–Thu, 8 hours" under the person's Working week.
- [ ] Signed in as an employee, their own panel reads "from your terms" and shows the terms' name without a link; a colleague who is not their report has no Employment terms tab.
- [ ] At phone width each row stacks its name, rules and source.

## Change terms

Add terms "Scotland" in Settings › Employment terms first, and a location "Glasgow" that starts people on Scotland.

- [ ] As the owner, "Change terms" on the tab opens the card with a dark border and the form on top: Terms (today's marked "England and Wales (now)"; picking it reads "<first name> is already on England and Wales on <date>." unless a move is planned before that date) and Applies from (today; days before 1 January this year, or before the person's start, can't be picked). The button greys out while the form is open.
- [ ] Picking Scotland from the 1st of next month adds "From 1 <month>: …" under each row that changes, such as "Mon–Fri, 7.5 hours · Scotland bank holidays", and "not offered" for a type Scotland doesn't offer; the hint ends "What changes on 1 <month> is marked below." The footer reads "Saving moves <first name> to Scotland from 1 <month>." with Cancel and Save.
- [ ] Today or a past date adds "<first name>’s allowance is worked out again from that date." to the footer.
- [ ] Save shows "<first name> moves to Scotland on 1 <month>."; the card still shows England and Wales, with "From 1 <month>: Scotland" and "Cancel change" under its name, and each row's planned line. A move from today shows "<first name> is on Scotland from <today>." and the card reads Scotland since today; Details › Job reads "Employment terms: Scotland".
- [ ] History, filtered to Employment terms, shows "You changed terms to Scotland from 1 <month>"; "Last changed by You on <today>" sits under the card.
- [ ] "Cancel change" asks "Cancel this change?" "<first name> stays on England and Wales."; Keep change leaves it; Cancel change shows "Change cancelled.", removes the line and adds "You cancelled the change of terms to Scotland from 1 <month>" to History.
- [ ] With Scotland picked, switching tab or closing the panel asks "Discard 1 unsaved change?"; Discard closes the form. With nothing picked, switching tab just closes it.
- [ ] Moving Aisha's location to Glasgow on Overview shows "Location saved. <first name> stays on England and Wales; Glasgow’s new people start on Scotland." and her terms stay.
- [ ] Signed in as an employee, the tab has no "Change terms" and no "Cancel change".
- [ ] At phone width the fields stack and the footer wraps its save line above Cancel and Save.

## Own working week

- [ ] As the owner, the Working week row has "Edit"; it opens the week editor in the row (hours each day prefilled, "32 hours a week, over 4 days. Was Mon–Fri, 7.5 hours.", Bank holidays, Applies from: Today, 1 Jan <next year>, Other date…). "Change terms" greys out while it is open.
- [ ] Mon–Thu 8 hours from 1 Jan next year: the footer reads "Saving gives <first name> their own working week from 1 Jan <year>."; Save toasts "<first name>’s own working week saved." and the row gains "From 1 Jan <year>: Mon–Thu, 8 hours · England and Wales bank holidays · <first name>’s own" with "Cancel change".
- [ ] From today: the row reads Mon–Thu, 8 hours with the "<first name>’s own" pill, and the footer had added "<first name>’s allowance is worked out again from that date."
- [ ] With an own week, "Use England and Wales’s week" asks only for Applies from with "Earlier days keep <first name>’s working week as it is."; saving toasts "<first name> is back on England and Wales’s week from <date>." and a planned return shows under the row with "Cancel change".
- [ ] "Cancel change" asks "Cancel this change?" "<first name>’s working week stays as it was." and removes the planned line; History shows "You gave them their own working week, …", "You put them back on their terms’ working week from …" and "You cancelled the change to their working week from …".
- [ ] For a person who starts next month, Edit, "Use England and Wales’s week" and "Cancel change" show on the Working week row, and Applies from starts on their start date.
- [ ] An own week stays through a move to other terms: Change terms marks no change on the Working week row and the footer adds "<first name> keeps their own working week."
- [ ] With the week edited, switching tab asks "Discard 1 unsaved change?".

## Own time off rules

- [ ] As the owner, each type row has "Edit"; on Annual leave it opens the rules editor in the row (How it counts, Allowance, Bank holidays on top, Leave year, Applies from: 1 Jan <this year>, 1 Jan <next year>, Other date…), prefilled from the terms' rules. "Change terms" and the Working week row's buttons grey out while it is open.
- [ ] 25 days from 1 Jan next year: the footer reads "Saving gives <first name> their own Annual leave rules from 1 Jan <year>."; Save toasts "<first name>’s own Annual leave saved." and the row gains "From 1 Jan <year>: 25 days a year, bank holidays on top" with "Cancel change".
- [ ] 25 days from 1 Jan this year: the row shows 25 days with the "<first name>’s own" pill, the footer had added "<first name>’s allowance is worked out again from that date.", and Overview's Annual leave card shows the new entitlement.
- [ ] Changing how it counts (Unlimited) with Other date set to a day that is not 1 January shows "How it counts changes only from the start of a leave year." and Save stays disabled.
- [ ] A type the terms don't offer reads "Not offered on England and Wales" and has "Offer to <first name>"; the footer reads "Saving offers Family leave to <first name> from …".
- [ ] With own rules, "Use England and Wales’s rules" asks only for Applies from; the footer reads "Saving puts <first name> back on England and Wales’s Annual leave rules from …", or "Saving takes Family leave away from <first name> from …, as England and Wales doesn’t offer it." for an offered type; saving toasts "<first name> is back on England and Wales’s Annual leave from <date>.".
- [ ] "Cancel change" on a planned own-rules line asks "Cancel this change?" "<first name>’s Annual leave stays as it was." and removes the line; History shows "You gave them their own Annual leave, …", "You put them back on their terms’ Annual leave from …" and "You cancelled the change to their Annual leave from …".
- [ ] Own rules stay through a move to other terms: Change terms marks no change on that row and the footer adds "<first name> keeps their own Annual leave."

## Time off

- [ ] A demo person who started before this year shows "Time off · <this year>" between the key facts and Details: an Annual leave card with Entitlement 28, Bank holidays 8, Used 0, Remaining 20, then Sickness, Family leave and Other, each "0 days recorded".
- [ ] A demo person who started this year shows their pro-rated figures, and entitlement − bank holidays − used equals remaining.
- [ ] After Reset setup, a person added without turning time off on shows "Time off" with "No time off this year."
- [ ] Invite a person (see [Invites](invites.md)) and sign in as them: their own panel shows the section; a colleague's panel who is not their report shows no Time off section; once they manage that colleague (Manager above), it shows.

## Remove

- [ ] ⋯ → "Remove <name>" asks "Remove <name>?" with an optional reason; Cancel keeps them.
- [ ] Remove closes the panel, shows "<name> removed" and the person leaves People; browser Back then shows "This person doesn’t exist."
- [ ] Pressing Back while a removal is still pending and opening another person keeps that person's panel open when the removal ends.

## Keyboard and narrow screens

- [ ] The whole flow works with the keyboard alone: open, edit, Add reason, Save, ⋯, Remove, Close.
- [ ] At phone width the panel fills the screen, the Details sections stack and the edit bar wraps.
