# QA: Time off settings

A manual check of the time off types list in Settings, adding a type and changing a type's name, look and privacy, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open Settings, then "Time off" under "Areas".

## The list

- [ ] The page reads "Time off" and "4 time off types, for 40 people." (the demo's people with time off today).
- [ ] The rows are Annual leave (a sun on green), Sickness (a thermometer on coral), Family leave (a baby on pink) and Other (confetti on yellow), in that order.
- [ ] Annual leave, Sickness, Family leave and Other each carry a "Built in" pill; the list has no Counts column and does not stretch the full width.
- [ ] Taken this year reads "0" for each, or the demo's booked days ("1 day", "2.5 days").
- [ ] After Exit demo and a new owner without the demo, the summary reads "4 time off types." with no people.

## Add a type

- [ ] "Add time off type" opens a dialog titled "Add time off type" with an empty name, the sun on yellow and "Show the reason to colleagues" on.
- [ ] The footer reads "Adds the type for the whole company. Every set of terms shows it as not offered until you offer it.", and names the type once one is typed.
- [ ] Picking an icon and a colour changes the tile beside the name at once; each of the 30 icons and 10 colours can be picked.
- [ ] Saving " Study leave " closes the dialog, shows "Study leave added." and lists Study leave after Other, by name, without a "Built in" pill.
- [ ] Settings › Employment terms › any terms shows Study leave as "Not offered here".
- [ ] Saving an empty name shows "Enter a name."; "annual LEAVE" shows "There's already a time off type called annual LEAVE."; 61 characters show "Use at most 60 characters." The dialog stays open.

## Change a type

- [ ] Clicking a row, or Tab to a type's name and Enter, opens its dialog with its icon, colour, name and privacy, and the footer "Name, look and privacy are the same in every terms."
- [ ] Renaming Annual leave to "Holiday" with another icon and colour shows "Holiday saved."; the list and every terms stack show the new name and look, with the same rules.
- [ ] Sickness's switch is off and disabled, with "Sickness is private by law. Colleagues only see “Away”."
- [ ] Switching off "Show the reason to colleagues" on Annual leave changes the hint to "Colleagues only see “Away”.", and after saving its rule line on a terms stack ends with "· Private".
- [ ] Sickness's rule line on a terms stack ends with "· Private".
- [ ] Cancel, ×, Escape and a click outside close the dialog without saving.
- [ ] Keyboard only: arrow keys move through the icons and the colours, and the focus ring shows on each.

## States

- [ ] With the API stopped, reloading shows "Time off types could not be loaded." and "Try again", which reloads the list once the API is back.
- [ ] At 375 px wide, the list fits without scrolling sideways; long names and "Doesn't count" wrap. The dialog fits, with 6 icons a row.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/time-off` redirects to People.
- [ ] The demo workspace: adding and changing a type works as above.
