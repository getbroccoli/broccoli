# QA: Time off settings

A manual check of the time off types list in Settings, adding a type, changing a type's name, look, privacy and default rules in its panel, and deleting a type, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open Settings, then "Time off" under "Areas".

## The list

- [ ] The page reads "Time off", with no summary line under it.
- [ ] The rows are Annual leave (a sun on green), Sickness (a thermometer on coral), Family leave (a baby on pink) and Other (confetti on yellow), in that order.
- [ ] The list has one column, Time off type, with no pill on any row, and does not stretch the full width.

## Add a type

- [ ] "Add time off type" opens a dialog titled "Add time off type" with an empty name, the sun on yellow, "Show the reason to colleagues" on, and under "When offered on terms" the counts choice at "Doesn't count".
- [ ] The footer reads "Adds the type for the whole company. Every set of terms shows it as not offered until you offer it.", and names the type once one is typed.
- [ ] Picking an icon and a colour changes the tile beside the name at once; each of the 30 icons and 10 colours can be picked.
- [ ] Saving " Study leave " closes the dialog, shows "Study leave added." and lists Study leave after Other, by name.
- [ ] Settings › Employment terms › any terms shows Study leave as "Not offered here".
- [ ] Adding "Training" with "Unlimited" under "When offered on terms", then offering it on any terms, opens the form at "Unlimited".
- [ ] Saving an empty name shows "Enter a name."; "annual LEAVE" shows "There's already a time off type called annual LEAVE."; 61 characters show "Use at most 60 characters." The dialog stays open.

## Change a type

- [ ] Clicking a row, or Tab to a type's name and Enter, opens its panel over the list at `/settings/time-off/<id>` with its icon, colour, name and privacy, and the footer "Name, look and privacy are the same in every terms."
- [ ] Cancel and Save show in the footer only once something changed; Cancel puts the saved values back.
- [ ] Renaming Annual leave to "Holiday" with another icon and colour shows "Holiday saved."; the list and every terms stack show the new name and look, with the same rules.
- [ ] On the demo, Annual leave's "When offered on terms" reads From a balance, 28 days, bank holidays not on top: the policy picked when time off was turned on. Sickness, Family leave and Other read "Doesn't count".
- [ ] Changing Annual leave's default to 25 days with bank holidays on top shows "Annual leave saved."; every terms stack still shows its own Annual leave rules.
- [ ] Days of 367, 2.3 or none under "From a balance" show "Enter days from 0 to 366, in half days." and Save stays off.
- [ ] Sickness's switch is off and disabled, with "Sickness is private by law. Colleagues only see “Away”."
- [ ] Switching off "Show the reason to colleagues" on Annual leave changes the hint to "Colleagues only see “Away”.", and after saving its rule line on a terms stack ends with "· Private".
- [ ] Sickness's rule line on a terms stack ends with "· Private".
- [ ] ×, Escape and a click outside close the panel without saving.
- [ ] Keyboard only: arrow keys move through the icons and the colours, and the focus ring shows on each.

## Delete a type

- [ ] The panel's "More actions" menu offers "Delete Study leave"; it asks "Delete Study leave?" with Cancel and Delete.
- [ ] Delete shows "Study leave deleted.", closes the panel and drops it from the list and every terms stack.
- [ ] Deleting Annual leave works the same; Settings › Employment terms then reads "Not offered" under Annual leave, and people's panels list no Annual leave.
- [ ] Exit demo, or Reset setup, brings Annual leave back with its name, sun on green, "Doesn't count" as its default and rules on setup.

## States

- [ ] With the API stopped, reloading shows "Time off types could not be loaded." and "Try again", which reloads the list once the API is back.
- [ ] At 375 px wide, the list fits without scrolling sideways; long names and "Doesn't count" wrap. The Add dialog fits with its icons wrapping; a type's panel fills the screen.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/time-off` redirects to People.
- [ ] The demo workspace: adding and changing a type works as above.
