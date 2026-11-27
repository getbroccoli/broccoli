# QA: Today

A manual check of the home page against a development stack: what needs you, who's out, your time off and who starts soon.

## Setup

1. Start the stack with `pnpm dev --drop-db` and finish setup with "Create account" (not "Explore the demo", whose owner can't invite), as in [QA setup](setup.md).
2. On People, add a manager, two of their reports and one person in another team, set the managers, and invite the manager and one report; accept both invites in separate browser profiles. Give one new person a start date within the next 13 days and another a start date one or more years ago whose anniversary falls within the next 13 days.
3. As the report, request a few days of Annual leave in the next two weeks. As the owner, book a day of Annual leave today and a day of a private type such as Sickness for the other report, and a booking that needs no approval for the report, more than two weeks ahead.

## Landing

- [ ] Finishing self-hosted setup ("Create account") ends on Today (`/`), with "Today" highlighted first in the menu.
- [ ] Finishing managed setup ("Start using Broccoli" on `/setup/ready`) ends on Today.
- [ ] Signing out and in again without a `redirect` ends on Today.
- [ ] The title reads "Good morning, {first name}", "Good afternoon, …" or "Good evening, …" by the computer's clock (before 12:00, before 18:00, after), with today's date under it, such as "Friday 27 November". An owner without an employee record reads "Good morning" with no name and has no "Your time off".
- [ ] No card invites you to connect your agent; "Your agent" stays in the menu.

## Needs you

- [ ] As the manager, "Needs you" lists the report's request with its due date and "Answer", which opens the task on Tasks.
- [ ] A to-do without a result form shows "Mark done"; pressing it says "Marked done".
- [ ] "See your tasks" opens `/tasks`; at most five tasks show on Today.
- [ ] Pressing "Mark done" with the keyboard moves focus to "See your tasks" once the task leaves the list.
- [ ] With nothing to do, the card reads "Nothing needs you right now."

## Who's out

- [ ] As the manager, "Your team" is chosen and lists the report off today under "Today", each with dates. The other report's request doesn't show; approve it with "Answer" in Needs you, and it shows under "Next 2 weeks".
- [ ] A booking on a Friday and the next Monday shows under "Next 2 weeks", not "Today", on the Saturday.
- [ ] "Everyone" lists approved time off of everyone else; your own never shows here.
- [ ] As the report, a colleague's approved Annual leave shows with its type, and their Sickness shows as "Off".
- [ ] A person with no manager and no reports sees no "Your team" / "Everyone" choice.
- [ ] With nobody out, the card reads "Nobody on your team is out in the next 2 weeks." on Your team and "Nobody is out in the next 2 weeks." on Everyone.
- [ ] "Time off" opens the Time off page on this month.

## Your time off

- [ ] As the report, the card shows the Annual leave left, such as "20 of 25 days of Annual leave left", with a bar; the waiting request with its dates, type and "Waiting for approval"; the booking that needed no approval as "Approved"; and "Request time off".
- [ ] "Request time off" opens the Time off dialog already set to you; Back closes it again.
- [ ] As the manager, the card shows the same, with "Request time off" or "Book time off" as their own time off allows.
- [ ] With nothing booked in the next two months, it reads "Nothing booked yet."
- [ ] With time off turned off ("Skip, turn on later" in setup), the card shows no request button.
- [ ] "See all" opens your own person panel.

## Coming up

- [ ] Someone with a start date in the next 13 days shows "Starts" with the date; someone with a work anniversary in the next 13 days shows "{n} years here" with the date.
- [ ] Without either, the card is not there.

## Failures

- [ ] With the API stopped, a fresh load of Today shows "This couldn't load. Try again" in Who's out and Your time off, and "Tasks could not load. Try again" in Needs you; starting the API and pressing "Try again" fills the card.

## Phone width

- [ ] At 390 px wide the cards stack in one column (Needs you, Who's out, Your time off, Coming up) and nothing overflows.
