# QA: Locations

A manual check of managing locations and their terms in Settings, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open `/settings/locations`.

## The table

- [ ] The Settings menu lists Locations under Areas, after Employment terms and Time off, not under Workspace.
- [ ] The table lists London, Manchester and Remote by name, with columns Location, Terms and People; each shows its terms ("England and Wales" with the "Default" pill) and how many people are in it.
- [ ] Without demo data (after Exit demo), it reads "No locations yet. Add one with New location."
- [ ] At phone width the table scrolls sideways in its box.

## A location

- [ ] Clicking a row, or its name with the keyboard, opens the location over the table at `/settings/locations/<id>`: a header with its name and "<count> people · England and Wales", Name, Terms, and the footer.
- [ ] With nothing changed there is no save line and Save is disabled.
- [ ] Renaming to "London office" shows "Saving renames London to London office."; Save closes the stack, toasts "London office saved." and the table shows the new name.
- [ ] A blank name shows "Enter a name."; another location's name shows "There is already a location called …".
- [ ] An unknown id, such as `/settings/locations/00000000-0000-4000-8000-000000000001`, says "This location could not be found."
- [ ] At phone width the stack is full screen with its footer at the bottom.

## Terms

Add a second set of terms first: in the database, or by finishing setup with time off turned on per location's nation, so Scotland exists.

- [ ] The Terms select lists every set of terms, the default first as "England and Wales (default)", with the hint "New people here start on these terms."
- [ ] Picking Scotland on London shows the amber note "London's new people will start on Scotland instead of England and Wales. The <count> people already in London stay on their terms." and the save line "Saving changes where new people in London start. Nobody moves today."
- [ ] The note reads "The 1 person already in … stays on their terms." with one person, and only its first sentence with nobody.
- [ ] Saving shows Scotland in the table; Employment terms' people counts don't change.
- [ ] Adding a person in London afterwards (import a staff file with that location) puts them on Scotland: its people count goes up by one.
- [ ] Picking "England and Wales (default)" again and saving shows the "Default" pill back in the table.

## New location

- [ ] "New location" opens an empty stack titled "New location", with the default terms picked and no save line until a name is typed.
- [ ] Typing "Leeds" shows "Saving adds Leeds. New people there start on England and Wales."; Save adds it to the table with "0" people and toasts "Leeds added."
- [ ] Picking Scotland before saving adds Leeds on Scotland.

## Leaving and deleting

- [ ] Closing with ×, Cancel or Escape after a change asks "Discard 1 unsaved change?"; "Keep editing" stays, "Discard" closes without saving.
- [ ] "Delete location" shows only on a location with nobody in it; it removes it, closes the stack and toasts "Leeds deleted."
- [ ] A location with people shows "A location can be deleted once nobody is in it." instead.
- [ ] Moving the last person out of a location on their panel and reopening it offers "Delete location".

## Access

- [ ] Signed in as an employee who is not an admin, `/settings` and `/settings/locations` redirect to People.
