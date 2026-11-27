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

- [ ] Click a bar: the booking shows its type, person, dates with "2.5 days deducted from Annual leave", one row per day with what it costs ("Full day · 1 day", "Morning · 0.5 days"), note and "Booked on".
- [ ] A Sickness booking shows its days, such as "3 days", with no "deducted".

## A changed working week

- [ ] Book Annual leave for two whole future weeks without bank holidays (such as Mon 7 – Fri 18 Dec) for someone on Monday to Friday, then give them Thursdays off from a date no later than the first Thursday (Employment terms › Working week).
- [ ] Time off page: Thu 10 and 17 Dec are plain non-working days on their row, with no bar; the bar's pieces round off on each side; the Off each day counts above those Thursdays leave them out.
- [ ] Booking details: "8 days deducted from Annual leave"; Thu 10 and Thu 17 Dec read "Non-working day · 0 days".
- [ ] A lone afternoon shows in the right half of its day, wide enough to click; a morning in the left half.
- [ ] For another person on Monday to Friday, book a single future Thursday, then give them Thursdays off from before it: its bar stays, so it can still be opened; the booking reads "0 days deducted from Annual leave"; Off each day leaves them out; cancelling it leaves Remaining unchanged.
- [ ] Cancel time off asks "Cancel this time off?"; Keep time off leaves it; Cancel time off removes the bar, shows "Time off cancelled." and gives the days back on the panel.

## Reverse an adjustment

- [ ] As the owner, Adjust a person's Annual leave by +5 with a comment, then open History: the row "Adjusted by you" has Reverse.
- [ ] Reverse asks "Reverse this adjustment?" with "This takes away the 5 days added on <date>. <name> will have <days> left." and an optional "Why?"; Keep adjustment leaves it.
- [ ] Reverse adjustment: the toast reads "Adjustment reversed."; Remaining drops by 5; the history shows "Adjustment of +5 reversed by you" (−5, with the reason) above the adjustment, now tagged "Reversed" and without Reverse.
- [ ] As an employee on their own panel: no Reverse.

## Request and approve

Add two people with `example.com` addresses (demo people can't be invited), make one the other's manager, invite both (see [Invites](invites.md)), and sign in as the employee. Keep a third person outside their reporting line for the colleague check.

- [ ] The page's button reads "Request time off"; it opens the dialog with "Request time off" as its title and the employee as Who, with no picker. A day click on their own row opens it too; colleagues' rows have no day buttons.
- [ ] Type lists every type offered to them, Sickness included; the note field reads "Note for your approver". Enter "Family visit". Mon 7 – Wed 9 Dec with a morning: "20 free now → 17.5 free after this"; the footer reads "Sent for approval." and the button "Request 2.5 days".
- [ ] Request: the toast reads "2.5 days requested."; the bar is hatched; its tooltip ends "Waiting for approval"; the Off each day counts don't change.
- [ ] Their panel: Annual leave Remaining 20 with "2.5 days waiting for approval", and a Requests row with "Waiting for approval".
- [ ] A second request on Tue 8 Dec is refused as a clash.
- [ ] Booking details show "Waiting for approval", "Waiting for approval since …" and Withdraw request.
- [ ] As the colleague outside the line, before any decision: the hatched bar isn't there.
- [ ] As the manager: the task "Approve <name>'s Annual leave, 7–9 Dec" is in Needs you, with the days, the balance and the note.
- [ ] Approve: the bar turns solid, the counts go up, the employee's panel shows Used 2.5, Remaining 17.5 and the row "Approved", and booking details "Approved by <manager> on …".
- [ ] Another request, then Reject with a comment: the bar disappears; the row reads "Rejected" with the comment.
- [ ] As the owner, the employee's approved leave shows Cancel time off; a waiting one shows Cancel request.

## Withdraw and cancel

- [ ] As the employee, Withdraw request on a waiting request asks "Withdraw this request?"; confirming shows "Request withdrawn.", removes the hatched bar, drops the waiting line and shows the Requests row "Withdrawn".
- [ ] As the manager: the task is in Resolved recently, Cancelled, reading "<name> withdrew this request.".
- [ ] As the owner, Cancel request on another waiting request: the row reads "Cancelled"; the manager's task reads "This request was cancelled." (an owner linked to an employee is named instead).
- [ ] As the employee, approved leave that starts tomorrow or later shows Cancel time off; cancelling gives the days back and the row reads "Cancelled".
- [ ] As the employee, approved leave that started today or earlier, and time off the owner booked for them, show no Cancel.

## Who approves

Same people as above. The owner needs an employee record for Owner approval.

- [ ] As the employee, pick Sickness: the title reads "Book time off", the footer "Booked straight away." and the button "Book 1 day"; booking it shows a solid bar at once and no task for anyone.
- [ ] As an admin, set Family leave to "The owner" (Settings › Time off). As the employee, request Family leave: "Sent for approval."; the owner has the task in Needs you, the manager doesn't. The owner approves it.
- [ ] With a request for Annual leave waiting on the manager, set Annual leave to "No approval". As the employee, Annual leave now reads "Book"; booking another day lands at once with no task. The waiting request is still in the manager's Needs you, and approving it works.

## Who sees what

- [ ] As an employee: no Book for someone, no day buttons on colleagues' rows, and no Cancel on colleagues' time off.
- [ ] As an admin who is also a person here: the page shows "Book time off" and "Book for someone". Book time off opens with the admin as Who; Book for someone opens with Pick someone.
- [ ] A colleague's Annual leave shows its colour and name with no note; a colleague's Sickness shows as a grey "Off".
- [ ] Their own Sickness shows by name, with its note.

## Phone

- [ ] At phone width the grid scrolls sideways with names kept in view, and the dialog fills the screen.
