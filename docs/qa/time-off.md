# QA: Time off and booking

A manual check of the Time off page, booking time off for someone and cancelling it, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md). The demo turns time off on: everyone has Annual leave (28 days, bank holidays included, 20 left in a full year), Sickness, Family leave and Other.
2. Sign in as `owner@example.com` and open Time off in the menu.

## The page

- [ ] Time off sits after People in the menu; the page says "Everyone's time off at Acme Corp." and shows this month.
- [ ] Previous, next and Today move the month; the month is in the URL (`?month=2026-12`) and reloading keeps it.
- [ ] One row per person, A to Z; "Filter people" narrows them by name, and "Nobody by that name." shows when none match.
- [ ] Weekends are shaded; England and Wales bank holidays (25 and 28 Dec 2026) are hatched with their names on hover.
- [ ] A person's name opens their panel.

## Book

- [ ] Click a free weekday on a person's row: Book time off opens with them and that day, and Day by day open.
- [ ] Widen the dates to Mon 7 – Wed 9 Dec in Pick the dates, set Wed 9 Dec to Morning: "That's 2.5 days." and "20 free now → 17.5 free after this"; the button reads "Book 2.5 days".
- [ ] Book: the toast reads "2.5 days booked for <name>.", the bar covers 7, 8 and the morning of 9 Dec, and the counts above those days go up by one.
- [ ] The person's panel shows Annual leave Used 2.5, Remaining 17.5.
- [ ] From the panel, Book time off opens the Time off page with the dialog for that person.
- [ ] 24 Dec – 4 Jan: "That's 5 days, not 8. Fri 25 Dec is Christmas Day, Mon 28 Dec is Boxing Day, Fri 1 Jan is New Year's Day." and one balance line per year.
- [ ] A Saturday and Sunday only: "These dates are all days <name> doesn't work." and Book stays disabled.
- [ ] Over the balance (book more days than are left): the strip turns amber and says how many more; booking still works and Remaining goes below zero.
- [ ] Sickness over booked Annual leave: "<name> already has time off on <day>. Change the dates." with Open that booking; Book stays disabled.
- [ ] Sickness on a free day: "Sickness doesn't count against a balance."; the panel's Sickness days recorded goes up.

## Details and cancel

- [ ] Click a bar: the booking shows its type, person, dates, days with Full day or Morning, note and "Booked on".
- [ ] Cancel booking asks "Cancel this booking?"; Keep booking leaves it; Cancel booking removes the bar, shows "Booking cancelled." and gives the days back on the panel.

## Who sees what

- [ ] Invite an employee (see [Invites](invites.md)) and sign in as them: they see Time off without Book time off, without day buttons and without Cancel booking.
- [ ] A colleague's Annual leave shows its colour and name with no note; a colleague's Sickness shows as a grey "Off".
- [ ] Their own Sickness shows by name, with its note.

## Phone

- [ ] At phone width the grid scrolls sideways with names kept in view, and the dialog fills the screen.
