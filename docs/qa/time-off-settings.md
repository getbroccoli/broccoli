# QA: Time off settings

A manual check of the time off types list and a type's panel in Settings, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open Settings, then "Time off" under "Areas".

## The list

- [ ] The page reads "Time off" and "4 time off types, for 40 people." (the demo's people with time off today).
- [ ] The rows are Annual leave (a sun on green), Sickness (a thermometer on coral), Family leave (a baby on pink) and Other (confetti on yellow), in that order.
- [ ] Annual leave reads "3 policies", with UK statutory minimum ("England and Wales · 38 people", "28 days, bank holidays included"), then 20 and 25 days plus bank holidays, greyed out with "No terms use it".
- [ ] Sickness, Family leave and Other are one row each, "England and Wales · 38 people" under the name and "Doesn't count".
- [ ] Taken this year reads "0" for each, or the demo's booked days ("1 day", "2.5 days").
- [ ] After Exit demo and a new owner without the demo, the summary reads "4 time off types." with no people.
- [ ] Each type row opens the type's panel; a policy row opens it at that policy.

## A type's panel

- [ ] Annual leave shows Type (name, "Show the reason to colleagues" on), then Policies with each policy open, "What changes" marked "Coming soon", and History.
- [ ] Change UK statutory minimum to 22 days with bank holidays on top: "Policy name" appears with "22 days plus bank holidays", the note about becoming your own, and the footer "Saving updates this year's allowances for the 38 people on UK statutory minimum."
- [ ] Save: the toast reads "Annual leave saved. 40 allowances updated.", History gains the line, and a person's panel shows Annual leave 30 days with 8 bank holidays, 22 remaining.
- [ ] Back on the list, "22 days plus bank holidays" has the 38 people, and "UK statutory minimum" is there again, unused.
- [ ] Add policy on Annual leave, name it, save: it appears with "No terms use it"; "Delete policy" on it, save: it is gone.
- [ ] A used policy has no "Delete policy" and shows how it counts as text.
- [ ] Sickness shows Rules with "Applies to"; "Show the reason to colleagues" is off and locked, with "Sickness is private by law."
- [ ] Renaming Sickness to "annual leave" shows "That name is already used."
- [ ] Closing with unsaved changes asks to discard them.
- [ ] At 375 px wide, the panel's columns stack and nothing scrolls sideways.

## States

- [ ] With the API stopped, reloading shows "Time off types could not be loaded." and "Try again", which reloads the list once the API is back.
- [ ] At 375 px wide, the list fits without scrolling sideways; long names, policy names and "Doesn't count" wrap.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/time-off` redirects to People.
