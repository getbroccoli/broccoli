# QA: Locations

A manual check of managing locations in Settings, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open `/settings/locations`.

## The list

- [ ] Locations lists London, Manchester and Remote, by name, each with how many people are in it ("1 person", "13 people").
- [ ] Without demo data (after Exit demo), the section reads "No locations yet."

## Add, rename, delete

- [ ] Typing "Leeds" and Add adds it with "0 people" in its place by name; the field empties.
- [ ] Adding " leeds " again shows "There is already a location called leeds." and adds nothing; a blank name shows "Enter a name."
- [ ] Rename on Leeds turns the name into a field; "Leeds office" and Save renames it; Escape or Cancel keeps the old name.
- [ ] Delete shows only on a location with nobody in it, and removes it.
- [ ] Moving the last person out of a location on their panel and reloading Settings offers Delete on it.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings` and `/settings/locations` redirect to People.
