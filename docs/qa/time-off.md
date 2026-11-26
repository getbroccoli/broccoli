# QA: Time off, booking and requests

A manual check of the Time off page, booking time off for someone, asking for one's own with approval, and cancelling, against a development stack.

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

## Request and approve

Add two people with `example.com` addresses (demo people can't be invited), make one the other's manager, invite both (see [Invites](invites.md)), and sign in as the employee. Keep a third person outside their reporting line for the colleague check.

- [ ] The page's button reads "Request time off"; it opens the dialog with "Request time off" as its title and the employee as Who, with no picker. A day click on their own row opens it too; colleagues' rows have no day buttons.
- [ ] Type lists only types that need approval (no Sickness); the note field reads "Note for your approver". Enter "Family visit". Mon 7 – Wed 9 Dec with a morning: "20 free now → 17.5 free after this"; the footer reads "Sent for approval." and the button "Request 2.5 days".
- [ ] Request: the toast reads "2.5 days requested."; the bar is hatched; its tooltip ends "Waiting for approval"; the Off each day counts don't change.
- [ ] Their panel: Annual leave Remaining 20 with "2.5 days waiting for approval", and a Requests row with "Waiting for approval".
- [ ] A second request on Tue 8 Dec is refused as a clash.
- [ ] Booking details show "Waiting for approval", "Waiting for approval since …" and "Nobody can cancel a waiting request yet." with no Cancel.
- [ ] As the colleague outside the line, before any decision: the hatched bar isn't there.
- [ ] As the manager: the task "Approve <name>'s Annual leave, 7–9 Dec" is in Needs you, with the days, the balance and the note.
- [ ] Approve: the bar turns solid, the counts go up, the employee's panel shows Used 2.5, Remaining 17.5 and the row "Approved", and booking details "Approved by <manager> on …".
- [ ] Another request, then Reject with a comment: the bar disappears; the row reads "Rejected" with the comment.
- [ ] As the owner, the employee's approved leave shows Cancel booking; a waiting one does not.

## Who sees what

- [ ] As an employee: no Book time off, no day buttons on colleagues' rows, and no Cancel booking.
- [ ] A colleague's Annual leave shows its colour and name with no note; a colleague's Sickness shows as a grey "Off".
- [ ] Their own Sickness shows by name, with its note.

## Phone

- [ ] At phone width the grid scrolls sideways with names kept in view, and the dialog fills the screen.
