# QA: Time off settings

A manual check of the time off types list in Settings, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Sign in as `owner@example.com` and open Settings, then "Time off" under "Areas".

## The list

- [ ] The page reads "Time off" and "4 time off types, for 40 people." (the demo's people with time off today).
- [ ] The rows are Annual leave (a sun on green), Sickness (a thermometer on coral), Family leave (a baby on pink) and Other (confetti on yellow), in that order.
- [ ] Counts reads "From a balance" for Annual leave and "Doesn't count" for the other three.
- [ ] Taken this year reads "0 days" for each, or the demo's booked days, with a half day as 0.5.
- [ ] After Exit demo and a new owner without the demo, the summary reads "4 time off types." with no people.
- [ ] Rows are not links, and the page has no button to add a type yet.

## States

- [ ] With the API stopped, reloading shows "Time off types could not be loaded." and "Try again", which reloads the list once the API is back.
- [ ] At 375 px wide, the list fits without scrolling sideways; long names and "Doesn't count" wrap.

## Access

- [ ] Signed in as an employee who is not an admin, `/settings/time-off` redirects to People.
