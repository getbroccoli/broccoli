# Time off

Time off lets a UK company run its leave from one choice. A fresh workspace has Annual leave, Sickness, Family leave and Other but no policy: time off is off, and nobody has a time off type until the owner turns time off on in setup, or the demo does. A company can then add its own types, policies, terms with different rules and one person's own policy without new code.

Hours, accrual, carry-over and other countries arrive later as new columns, values or tables, without rewriting stored rows.

## Rules

- A balance is never stored. It is the sum of dated ledger lines, and each line names its cause.
- Ledger lines are append-only: a correction is a new line, never an update.
- Changes over time are dated rows (who is on which terms, policy assignments, employments, working patterns), never edits of the past.
- Time off reads employments, terms, working patterns and bank holidays through other modules' public operations, never their tables. Whose bank holidays apply comes with each working week; the dates come from the bank holidays module's `BankHolidayService`.

## Turning time off on

`TimeOffService.turnOnTimeOff` is how time off goes on, in the caller's transaction: as setup finishes (before the approved people are added and invited), and in the demo fill. It takes one entry per nation's terms (bank holiday calendar, standard working week, one of the standard Annual leave policies), which nation's terms each location gets, and the default terms' nation (England and Wales unless sent; its entry is required). The Company defaults page sends the same week and policy for every nation. It refuses with CONFLICT ("Time off is already on.") once any terms have a policy, sets the terms up through the employees module (see [terms](../employees/module.md#terms)), gives each a copy of its standard Annual leave policy and a record-only policy for every other type, and ensures any existing members' allowances. The imported people join their locations' terms directly; `employees.added` ensures their allowances after commit. `timeOff.time_off_turned_on` logs the outcome after commit. "Skip, turn on later" calls nothing.

`TimeOffSetupService` serves the Company defaults page: the standard Annual leave policies, each nation's bank holidays this year, and a suggestion of whose bank holidays apply per location. The suggestion is one decisions request with the location names only, unmasked (`unmaskedKeys`), at most 100; an unsure or unclear answer, or no answer at all (an external agent, no key, a failed request), is England and Wales, marked for the owner to check.

## Data model

- **`time_off_types`:** a kind of time off: Annual leave, Sickness, Family leave, Other, or the company's own. `type_key` marks the four seeded types, so rules never depend on a name. `unit` is what its time off is counted in, `day` or `hour`; every type is `day`, and only days are counted so far. `icon` and `colour` are how lists show it; null means the default, a sun on yellow, which GraphQL returns in its place. Names are unique ignoring case and surrounding spaces. `private` hides the reason from colleagues and stays true for Sickness. Admins add a type and change its name, icon, colour and privacy in Settings (`createType`, `changeType`); a new type has no policy, so no terms offer it until they get one. `deleteType` deletes any type, a seeded one too, with its policies, exceptions and allowances, and refuses one with any time off on record; starting over inserts deleted seeded types again.
- **`terms`** and **`employee_terms`** (employees module): named sets of people, such as "England and Wales" or "UK office", and who is on which terms from when to when. A new person starts on their location's default terms, else on the default terms ("England and Wales" unless setup gave them another nation); see the [employees module](../employees/module.md#terms).
- **`time_off_policies`:** a policy for one type: one set of terms' own (`terms_id`, no name; at most one per terms and type), or a named one that people are put on one by one through assignments.
- **`time_off_policy_versions`:** a policy's rules from `start_date` to `end_date`: `balance` (`balance_from_allowance`, `unlimited_balance`, `no_balance`), bank holidays (included in the allowance or on top) and the leave year start (a fixed date or the employee's start date). A policy's versions never overlap and are never edited: a change ends one and adds the next. No version on a date: the policy does not apply that day, and for terms the type is not offered.
- **`time_off_allowance_rules`:** the parts that add up to a version's allowance, never edited either. A rule outlives a removed version (its version id becomes null), since ledger lines granted from it point at it; deleting every policy deletes these too:
  - `yearly_entitlement`: days for a working week, as contracts state them (28 for 5), with an optional `max_days`;
  - `service_extra`: extra days after a number of years of service.
- **`time_off_policy_assignments`:** exceptions, meaning one person on a named policy between two dates; never a terms' own. Reset setup and Exit demo delete every policy and allowance, and the company's own types, and give the seeded types back their names, looks and privacy.
- **`allowances`:** one person's allowance for one type and one leave year. It has no amount column; its dates are fixed when it is created and never change.
- **`allowance_ledger_lines`:** every change to an allowance (grants, bank holidays, booked days, manual adjustments, rounding), with its effective date, cause and author.
- **`time_off`:** a person's time off and where it stands (`requested`, `approved`, `rejected`, `cancelled`), never what waits on it. A request sets `requested_at`; its decision sets `decided_at`, `decided_by_employee_id` (null once that employee is deleted) and `decision_comment`, and an approval that ended without a decision leaves them null on `cancelled`.
- **`time_off_days`:** the days of a time off, each a full day, a morning or an afternoon. What a day costs is written as ledger lines, never stored on the day.

## Standard leave policies

Code constants (`domain/standardLeavePolicies.ts`) that turning time off on copies into terms, each `balance_from_allowance` with a leave year from 1 January and found by its key, never by name:

- `uk_statutory_minimum`, "UK statutory minimum": 28 for 5, `max_days` 28, bank holidays included;
- `uk_20_days_plus_bank_holidays`: 20 for 5, bank holidays on top;
- `uk_25_days_plus_bank_holidays`: 25 for 5, bank holidays on top.

## Allowance engine

`TimeOffService.ensureAllowances` is the only code that writes allowances and their engine lines (grants, bank holidays taken, rounding). It joins the caller's transaction and is trusted, so the caller checks permissions and logs the outcome after commit. It locks existing employee rows in id order until the transaction ends and skips missing employees, so concurrent runs for one person take turns with employee changes and deletion. For each person and type:

1. Every allowance whose leave year has not ended is recalculated; a closed leave year never is.
2. An allowance is created for the leave year of the policy that applies on the later of today (London) and the person's start, unless one already overlaps it or the person is employed on none of its days. A `no_balance` policy gets none; an `unlimited_balance` one gets no lines.
3. The target (`domain/allowanceCalculator.ts`) splits the leave year wherever the employment, policy version, working week or service step changes, and pro-rates each rule by the part's days per week and share of the year. On-top policies add the year's bank holidays for the days per week; days per week is the number of weekdays with minutes above 0, and each bank holiday on such a working day is taken as 1 day. The grants are rounded up once to the half day.
4. Each line identity (a rule's grant, the bank holiday grant, one bank holiday, the rounding) whose lines add up to something else gets one line with the difference, author Broccoli itself, cause and ref from the call. A bank holiday's line takes effect on its date. Initial grants take effect on their first contributing day. Start-date corrections use the earlier of the previous and new starts (the year start if either is unknown), but never before the grant's first contributing day in either calculation; rounding follows the earliest changed grant. Working-pattern corrections use the later of the change date and the first contributing day. All dates stay within the allowance year. The idempotency key is `allowanceId:identity:n`, `n` the identity's existing lines: a repeat appends nothing.

Causes (`cause_kind`, with `cause_ref`): `time_off_turned_on` (no ref), `time_off_booked` and `time_off_cancelled` (time off id), `employee_added`, `start_date_changed` (new date), `working_pattern_changed` (from date), `time_off_rules_changed` (`<policy id>:<from date>`; corrections start from the later of that date and the first contributing day), `leave_year_started` and `daily_check` (the run's date). Amounts carry six decimal places.

What runs the engine; none writes lines itself, and while no policy applies each run writes nothing:

- turning time off on, for the terms' people, in the same transaction;
- `employees.added` (one person, import approval or the demo), `employees.start_date_changed` and `employees.working_pattern_changed`: after commit, time off runs the engine for the event's people in its own transaction as the system. Handlers are awaited, but a failure does not undo the employee change. Events can be lost in a crash; the daily job repairs that.
- the daily job `timeOff.ensureAllowances`, at 00:10 London time, for every employee as the system, 100 per transaction: it starts the new leave year (cause `leave_year_started` on 1 January, else `daily_check`), repairs lost events and picks up changed bank holidays. A failed batch is logged and left to the next run.
- The demo fill turns time off on after adding the demo people: the default terms on Monday to Friday, 7.5 hours, and `uk_statutory_minimum`, with the three record-only policies.

Full-timer in England and Wales employed all of 2026 on the statutory minimum: grant 28, bank holidays −8, remaining 20. On 25 days plus bank holidays: 25 + 8 − 8 = 25.

## Reading a person's time off

`TimeOffService.readTimeOffTypes` gives each person the time off types they have, with their figures, as `Employee.timeOffTypes` and the person's panel show them. It follows the `time_off` permission: the person, everyone above them in the reporting line and admins read it; anyone else gets nothing (`null` in GraphQL).

- The date read is today, or the person's start when it is later, so a future starter sees their first leave year.
- A type shows when a policy applies to the person on that date (see below), Annual leave first, then Sickness, Family leave, Other and the company's own types by name.
- `balance_from_allowance`: the allowance whose leave year holds the date, summed by line kind over the whole year. Entitlement is the grants, rounding and manual adjustments; bank holidays are those taken; used is the days booked; remaining is entitlement − bank holidays − used. Each is rounded to two decimals and remaining is worked out from the rounded figures, so a row adds up.
- `unlimited_balance`: only the days booked on its allowance.
- `no_balance`: no leave year exists, so the calendar year; the days of approved time off of that type, a half day 0.5; shown only when the person is employed on some day of that year.
- No allowance for the year (the person left before it) or no policy at all (time off is off) gives no row; while time off is off the list is empty for everyone.

## Balance history and adjustments

`AllowanceService` explains a balance and lets admins change it.

- `readAllowanceHistory` (the `time_off` read scope) gives each allowance's changes, newest first: its lines grouped by the transaction that wrote them (`created_at`), cause and ref; each adjustment is a change of its own. Each change carries its parts by kind, the booked days it touched, the date its cause names, the remaining figure after it (worked out as the panel works it out, so the newest equals Remaining) and its amount, the difference from the change before. A change is left out only when its amount and every rounded part are 0.
- `adjustAllowance` (the `time_off` update scope, admins for now) appends one `manual_adjustment` line with the comment as its reason, cause `allowance_adjusted` and the signed-in user as author, dated today within the leave year. It takes a non-zero amount of at most two decimals and 366 days either way and a comment of 1 to 1,000 characters, refuses a leave year that has ended (CONFLICT) and any allowance other than the person's current `balance_from_allowance` one. The balance may go negative. A `requestId` the dialog makes once per adjustment becomes the line's idempotency key, so sending it again appends nothing. Reusing a `requestId` for other values is refused (`requestId` / `taken`). The check and the append run in one transaction that takes employee writes, policies and the person in the order bookings take them. The engine never reads or writes `manual_adjustment` lines, so an adjustment stays through every recalculation; a wrong one is undone by another.

```json
{
  "kind": "manual_adjustment",
  "amount": "2",
  "effective_date": "2026-11-26",
  "cause_kind": "allowance_adjusted",
  "cause_ref": null,
  "reason": "Carried over from 2025",
  "author_kind": "signed_in_user",
  "author_id": "usr_hannah"
}
```

## Booking time off

`BookTimeOffService` books time off, approved straight away, for whoever the caller may book for directly (write mode `direct`: admins, through `time_off.manage.all`), and cancels it (the `time_off` delete scope, admins only). Anyone with the `time_off` create scope previews it, so employees preview their own (`time_off.create.self`), whose write mode is `request`: booking refuses them with "Your time off needs to be requested."

- A day costs 1, a morning or afternoon 0.5, and 0 on a weekday the person's working week has no minutes for or on a bank holiday of that week's calendar (`domain/bookedDay.ts`). Only days that cost something are stored as `time_off_days`.
- `bookTimeOff` refuses, as invalid input on `dates`: a clash with approved or requested time off of any type (a morning and an afternoon can share a day), no working days, a type with no policy for the person on some date, a date outside employment, a date before the start of the leave year holding today or after the end of the next one, and more than 366 days. Over the balance is never refused.
- `previewBooking` books and runs the engine in a transaction it rolls back, so what it shows is what booking writes: each date's cost and reason, and each touched leave year's remaining before and after.
- `cancelTimeOff` marks the time off cancelled; its days stay.
- Both run the engine for the person in the same transaction, causes `time_off_booked` and `time_off_cancelled` (ref: the time off id).
- `WhosOutService.readWhosOut` gives everyone signed in each readable person's dates (working, not a working day, bank holiday, not employed) and approved bookings over at most 62 days. A private type's id, and every booking's cost, note and booked time, are left out for anyone outside the person's `time_off` read scope.

## Requesting time off

`TimeOffRequestService.requestTimeOff` saves the caller's own time off as `requested` when their write mode for it is `request` (employees, for themselves; whoever books it straight away is refused, as is anyone else). Its type must need approval (`needs_approval`, false for Sickness), and the booking rules apply as for `bookTimeOff`. It writes no ledger lines: its days are held, so they clash with any other time off, the preview's "remaining before" takes them off, and `Employee.timeOffTypes` shows them as `waiting`. In the same transaction it asks `manager_approval` (approvals) for the record type `time_off`; the approver's task reads the type, the dates and part days, the cost, the balance free now and after, and the note.

`finishApprovals` handles `approvals.approval_finished` for `time_off` before the commit, in the decision's transaction: approved re-checks the window, employment and the type's offer for every day (refusing the decision, so the task stays to do, when one no longer fits), sets `approved` and the decision, and runs the engine (cause `time_off_approved`); rejected stores the comment; an approval that ended without a decision cancels it. Time off no longer `requested` is left alone. Each change appends a `time_off` history line, the decision's caused by its process run; the outcome is logged after commit from `timeOff.request_decided`.

Only approved time off is cancelled. Who's out shows requested time off only to who may read the person's time off. Resetting time off purges its history. `Employee.timeOffRequests` lists a person's requests from their current leave year on. Days recorded and Settings' days taken count approved time off only.

The engine treats each booked day as a line identity, `time_off_booked` per `time_off_day_id`, on the allowance whose leave year holds the day: minus the day's cost under the working week of that day while the time off is approved, 0 once cancelled. Every run re-costs booked days in open leave years, so a later terms move, own week or bank holiday change gives days back or takes them. A booked day in a later leave year creates that year's allowance.

## Listing time off types for Settings

`TimeOffService.listTimeOffTypes`, for admins (`MANAGE_WORKSPACE`), answers `Query.timeOffSettings`: every time off type in the order above, with or without a policy, and how many people have time off.

- Each type's balance kind is the one most of its policies share, each by its version in force today or else its latest version, the oldest policy's on a tie; none when the type has no policy.
- Days taken are everyone's approved days of that type in the calendar year of today, a half day 0.5.
- People are those with an allowance whose leave year has not ended, counted in one query; someone with only types that have no balance is not counted.

## Changing a policy from a date

`TimeOffPolicyService`, for admins, changes terms' rules after time off is on, as the working week changes (see [working patterns](../employees/module.md#rules)): from no earlier than the start of the current leave year, a later planned version stays, and only a version that has not started can be cancelled.

- `createPolicy` offers a type the terms don't have; `changePolicy` adds new rules from a date; `cancelPolicyChange` removes a planned version, and the policy too when it was a planned offer.
- A stop is a draft, like an edit: `saveTimeOffStop` saves the terms' draft for a type with `stops: true`, a copy of their rules today. Publishing it ends each ticked owner's rows of that policy the day before the date and deletes later ones, adds none, and deletes the draft, so past rules and history stay. Publish is refused while someone's approved or pending time off of the type from that date would be left without rules. Before a published stop takes effect, `cancelPolicyStop` with the ended assignment's id makes it open-ended again. A stopped type is offered again by publishing a rules draft from the stop date or later. Its history value is `{"stopDate": …}`.
- How a type counts (`balance`) changes only from the start of a leave year; an offer may count any way.
- The new version keeps what Settings does not show from the one it replaces: leave year, days per week, service steps, and `max_days` while the new days stay at or under it.
- Each runs the engine for the people it reaches in the same transaction (cause `time_off_rules_changed`) and adds one `terms` history line, field `timeOff.<type id>`, with the rules before and after as JSON and the type's name as the label.
- `readPolicyReach` and `readOfferReach` list who a change reaches: everyone the policy applies to, or would apply to, on some employed day from the date on, through the shared resolver.

## Which policy applies

For one employee, type and date:

1. the person's assignment on that date, if any;
2. otherwise their terms' own policy for that type;
3. otherwise none, and the person cannot book that type.

That policy's version on that date gives the rules; with no version, none applies. The rule is the one that picks a working pattern, shared through the employees module's resolver.

An assignment or membership counts only on days the person has an employment.

## Example: joining in October

Sam joins on Monday 12 October 2026 and works Monday to Friday. "England and Wales" has the UK statutory minimum: 28 days for 5, bank holidays included, leave year from 1 January.

Sam is employed for 81 days of the leave year, from 12 October to 31 December:

- grant: 28 × 81 ÷ 365 = 6.213699, rounded up to the half day, 6.5;
- bank holidays: 25 and 28 December fall on Sam's working days, so each takes off one day.

```json
{
  "allowance": {
    "id": "al_01",
    "employee_id": "emp_sam",
    "time_off_type_id": "type_annual_leave",
    "leave_year_start": "2026-01-01",
    "leave_year_end": "2026-12-31"
  },
  "allowance_ledger_lines": [
    {
      "id": "ln_01",
      "allowance_id": "al_01",
      "effective_date": "2026-10-12",
      "unit": "days",
      "amount": "6.213699",
      "kind": "entitlement_grant",
      "cause_kind": "time_off_turned_on",
      "cause_ref": null,
      "allowance_rule_id": "rule_england_and_wales_yearly_28_for_5",
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:entitlement_grant:rule_england_and_wales_yearly_28_for_5:0",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_02",
      "allowance_id": "al_01",
      "effective_date": "2026-10-12",
      "unit": "days",
      "amount": "0.286301",
      "kind": "rounding_up_to_half_day",
      "cause_kind": "time_off_turned_on",
      "cause_ref": null,
      "allowance_rule_id": null,
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:rounding_up_to_half_day:0",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_03",
      "allowance_id": "al_01",
      "effective_date": "2026-12-25",
      "unit": "days",
      "amount": "-1",
      "kind": "bank_holiday_taken",
      "cause_kind": "time_off_turned_on",
      "cause_ref": null,
      "allowance_rule_id": null,
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:bank_holiday_taken:2026-12-25:0",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_04",
      "allowance_id": "al_01",
      "effective_date": "2026-12-28",
      "unit": "days",
      "amount": "-1",
      "kind": "bank_holiday_taken",
      "cause_kind": "time_off_turned_on",
      "cause_ref": null,
      "allowance_rule_id": null,
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:bank_holiday_taken:2026-12-28:0",
      "created_at": "2026-10-12T00:00:05Z"
    }
  ]
}
```

That gives Sam 6.213699 + 0.286301 − 1 − 1 = 4.5 days to book in 2026.

- **The allowance covers the whole leave year,** even though Sam joined in October. The start date only shortens the stretch the grant is pro-rated over.
- **Only bank holidays from the start date are charged.** The earlier 2026 bank holidays fall before Sam was employed.
- **On 1 January 2027** Sam gets a new allowance with the full 28 days, less that year's bank holidays.
