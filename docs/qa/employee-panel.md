# QA: A person's panel

A manual check of opening a person from People, editing them in place, their history and removing them, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open `/people`.

## Open and close

- [ ] Clicking anywhere in a row opens that person's panel over the list; the URL becomes `/people/<id>` and keeps the list's search and sort.
- [ ] Tab to a name and press Enter: the same panel opens.
- [ ] The panel shows the avatar, name and job title; Start date, Tenure ("2 yrs 1 mo", "Starts in 3 days" for a future start) and Work email; Details in Job, Contact and Personal; History below.
- [ ] Close (×), Escape and the browser Back button close the panel and return to the same list.
- [ ] Reloading `/people/<id>` opens the panel again; an unknown id shows "This person doesn’t exist." with Back to People.

## Edit in place

- [ ] Hovering a value shows a pencil; clicking it (or Enter on it) turns it into a text field, or a date picker for Start date.
- [ ] Editing two fields marks each with a green bar; the bar at the bottom says "2 unsaved changes · <fields in panel order> · saved as one history entry".
- [ ] Changing a field back to its saved value removes its mark; Escape inside a field reverts only that field; Cancel reverts everything and hides the bar.
- [ ] "Add reason" turns into one optional field; Save with a reason adds one history line "updated 2 fields: …" with the reason and "Edited"; expanding it shows each old → new value.
- [ ] Save of one field reads "changed job title <old> → <new>"; clearing a job title reads "cleared job title <old>" with the old value struck through.
- [ ] The People row shows the new values after Save.
- [ ] Clearing the first name, or entering an email another person has, keeps the field open with "Enter a value." or "Another person has this email." and saves nothing; typing a correction keeps the field open.

## Manager

- [ ] Job shows Manager under Job title: "—" without one, else the manager's name.
- [ ] Clicking it opens a search with "No manager" and up to 8 people, never the person themselves; typing filters by name or email and Enter picks the first match once results show (a search with no match picks nothing); arrow keys and Enter, or a click, pick one; Escape reverts.
- [ ] Save adds "set manager to <name>" with "Edited", then "changed manager <old> → <new>"; picking "No manager" and saving reads "cleared manager <old>".
- [ ] Picking someone who reports to them (directly or through others) keeps the field open with "The person you chose already reports to them, so they can’t be their manager." and saves nothing.
- [ ] Removing a manager clears Manager on each of their reports; opening a report (without reloading) shows "cleared manager <name>" with "Manager removed" in their history.

## Leaving with unsaved changes

- [ ] With unsaved changes, Close, Escape or Back asks "Discard N unsaved changes?"; Keep editing stays, Discard leaves without saving.
- [ ] Reloading or closing the tab with unsaved changes shows the browser's own leave prompt.

## History

- [ ] Lines are newest first, grouped "Today", "Yesterday", "21 Oct"; each has the author (the owner's email, or "Broccoli" for the demo), the cause and the time.
- [ ] The demo person's first line is "Broccoli added <first name> with 5 fields: …" with "Demo".
- [ ] With more than 50 lines, "Show older changes" loads the rest.

## Remove

- [ ] ⋯ → "Remove <name>" asks "Remove <name>?" with an optional reason; Cancel keeps them.
- [ ] Remove closes the panel, shows "<name> removed" and the person leaves People; browser Back then shows "This person doesn’t exist."
- [ ] Pressing Back while a removal is still pending and opening another person keeps that person's panel open when the removal ends.

## Keyboard and narrow screens

- [ ] The whole flow works with the keyboard alone: open, edit, Add reason, Save, ⋯, Remove, Close.
- [ ] At phone width the panel fills the screen, the Details sections stack and the edit bar wraps.
