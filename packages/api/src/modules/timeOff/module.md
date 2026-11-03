# Time off

Time off lets a UK company run its leave from one choice. A fresh workspace has Annual leave, Sickness, Family leave and Other, the three standard leave policies for Annual leave and one record-only policy for each other type, but links no policy to any group: nobody has a time off type until an admin, or the demo, links policies to "Everyone". A company can then add its own types, policies, groups of people with different rules and one person's own terms without new code.

Hours, accrual, carry-over and other countries arrive later as new columns, values or tables, without rewriting stored rows.

## Rules

- A balance is never stored. It is the sum of dated ledger lines, and each line names its cause.
- Ledger lines are append-only: a correction is a new line, never an update.
- Changes over time are dated rows (group membership, policy assignments, employments, working patterns), never edits of the past.
- Time off reads employments, policy groups, working patterns and bank holidays through other modules' public operations, never their tables. Whose bank holidays apply comes with each working week; the dates come from the bank holidays module's `BankHolidayService`.

## Data model

- **`time_off_types`:** a kind of time off: Annual leave, Sickness, Family leave, Other, or the company's own. `type_key` marks the four seeded types, so rules never depend on a name.
- **`policy_groups`** and **`employee_policy_groups`** (employees module): named sets of people, such as "Everyone" or "UK office", and who is in which group from when to when. Every new person joins "Everyone"; see the [employees module](../employees/module.md#policy-groups).
- **`time_off_policies`:** the rules for one type. This is where `balance` (`balance_from_allowance`, `unlimited_balance`, `no_balance`), bank holidays (included in the allowance or on top) and the leave year start (a fixed date or the employee's start date) are set. A policy is a group's default for that type through `policy_group_time_off_policies`, or used only through assignments.
- **`time_off_allowance_rules`:** the parts that add up to a policy's allowance:
  - `yearly_entitlement`: days for a working week, as contracts state them (28 for 5), with an optional `max_days`;
  - `service_extra`: extra days after a number of years of service.
- **`policy_group_time_off_policies`:** which policy a group gets for one type, from a date to a date. Dated, so moving a group to another policy keeps its earlier dates. `TimeOffService.linkGroupPolicies` is the only way a link is made: from the beginning, one policy per type, then it ensures the members' allowances in the same transaction. Reset setup and Exit demo remove every link.
- **`time_off_policy_assignments`:** exceptions, meaning one person on a given policy between two dates.
- **`allowances`:** one person's allowance for one type and one leave year. It has no amount column; its dates are fixed when it is created and never change.
- **`allowance_ledger_lines`:** every change to an allowance (grants, bank holidays, booked days, manual adjustments, rounding), with its effective date, cause and author.
- **`time_off`:** a person's time off and its approval status (`pending_approval`, `approved`, `declined`, `cancelled`).
- **`time_off_days`:** the days of a time off, each a full day, a morning or an afternoon. What a day costs is written as ledger lines, never stored on the day.

## Standard leave policies

Each is `balance_from_allowance` with a leave year from 1 January, found by `time_off_policies.key`, never by name:

- `uk_statutory_minimum`, "UK statutory minimum": 28 for 5, `max_days` 28, bank holidays included;
- `uk_20_days_plus_bank_holidays`: 20 for 5, bank holidays on top;
- `uk_25_days_plus_bank_holidays`: 25 for 5, bank holidays on top.

## Allowance engine

`TimeOffService.ensureAllowances` is the only code that writes allowances and their engine lines (grants, bank holidays taken, rounding). It joins the caller's transaction and is trusted, so the caller checks permissions and logs the outcome after commit. It locks existing employee rows in id order until the transaction ends and skips missing employees, so concurrent runs for one person take turns with employee changes and deletion. For each person and type:

1. Every allowance whose leave year has not ended is recalculated; a closed leave year never is.
2. An allowance is created for the leave year of the policy that applies on the later of today (London) and the person's start, unless one already overlaps it or the person is employed on none of its days. A `no_balance` policy gets none; an `unlimited_balance` one gets no lines.
3. The target (`domain/allowanceCalculator.ts`) splits the leave year wherever the employment, policy, working week or service step changes, and pro-rates each rule by the part's days per week and share of the year. On-top policies add the year's bank holidays for the days per week; each bank holiday on a working day is taken by that day's minutes ÷ the full day. The grants are rounded up once to the half day.
4. Each line identity (a rule's grant, the bank holiday grant, one bank holiday, the rounding) whose lines add up to something else gets one line with the difference, author Broccoli itself, cause and ref from the call. A bank holiday's line takes effect on its date. Initial grants take effect on their first contributing day. Start-date corrections use the earlier of the previous and new starts (the year start if either is unknown), but never before the grant's first contributing day in either calculation; rounding follows the earliest changed grant. Working-pattern corrections use the later of the change date and the first contributing day. All dates stay within the allowance year. The idempotency key is `allowanceId:identity:n`, `n` the identity's existing lines: a repeat appends nothing.

Causes (`cause_kind`, with `cause_ref`): `policy_linked_to_group` (group id), `employee_added`, `start_date_changed` (new date), `working_pattern_changed` (from date), `leave_year_started` and `daily_check` (the run's date). Amounts carry six decimal places.

What runs the engine; none writes lines itself, and while no policy is linked each run writes nothing:

- linking policies to a group, for its members, in the same transaction;
- `employees.added` (one person, import approval or the demo), `employees.start_date_changed` and `employees.working_pattern_changed`: after commit, time off runs the engine for the event's people in its own transaction as the system. Handlers are awaited, but a failure does not undo the employee change. Events can be lost in a crash; there is no automatic retry or scheduled daily repair yet.
- The demo fill links "Everyone" to `uk_statutory_minimum` and the three record-only policies after adding the demo people.

Full-timer in England and Wales employed all of 2026 on the statutory minimum: grant 28, bank holidays −8, remaining 20. On 25 days plus bank holidays: 25 + 8 − 8 = 25.

## Which policy applies

For one employee, type and date:

1. the person's assignment on that date, if any;
2. otherwise the policy their group gets for that type on that date;
3. otherwise none, and the person cannot book that type.

An assignment or membership counts only on days the person has an employment.

## Example: joining in October

Sam joins on Monday 12 October 2026 and works Monday to Friday. Everyone has the UK statutory minimum: 28 days for 5, bank holidays included, leave year from 1 January.

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
      "cause_kind": "policy_linked_to_group",
      "cause_ref": "group_everyone",
      "allowance_rule_id": "rule_everyone_yearly_28_for_5",
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:entitlement_grant:rule_everyone_yearly_28_for_5:0",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_02",
      "allowance_id": "al_01",
      "effective_date": "2026-10-12",
      "unit": "days",
      "amount": "0.286301",
      "kind": "rounding_up_to_half_day",
      "cause_kind": "policy_linked_to_group",
      "cause_ref": "group_everyone",
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
      "cause_kind": "policy_linked_to_group",
      "cause_ref": "group_everyone",
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
      "cause_kind": "policy_linked_to_group",
      "cause_ref": "group_everyone",
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
