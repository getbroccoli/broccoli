# Time off

Time off lets a UK company run its leave with nothing to set up. A fresh workspace gets Annual leave, Sickness, Family leave and Other, each with a policy for everyone. A company can then add its own types, policies, groups of people with different rules and one person's own terms without new code.

Hours, accrual, carry-over and other countries arrive later as new columns, values or tables, without rewriting stored rows.

## Rules

- A balance is never stored. It is the sum of dated ledger lines, and each line names its cause.
- Ledger lines are append-only: a correction is a new line, never an update.
- Changes over time are dated rows (group membership, policy assignments, employments, working patterns), never edits of the past.
- Time off reads employments, policy groups, working patterns and bank holidays through other modules' public operations, never their tables.

## Data model

- **`time_off_types`:** a kind of time off: Annual leave, Sickness, Family leave, Other, or the company's own. `type_key` marks the four seeded types, so rules never depend on a name.
- **`policy_groups`** and **`employee_policy_groups`** (employees module): named sets of people, such as "Everyone" or "UK office", and who is in which group from when to when.
- **`time_off_policies`:** the rules for one type. This is where `balance` (`balance_from_allowance`, `unlimited_balance`, `no_balance`), bank holidays (included in the allowance or on top) and the leave year start (a fixed date or the employee's start date) are set. A policy is either a group's default for that type or used only through assignments.
- **`time_off_allowance_rules`:** the parts that add up to a policy's allowance:
  - `yearly_entitlement`: days for a working week, as contracts state them (28 for 5), with an optional `max_days`;
  - `service_extra`: extra days after a number of years of service.
- **`time_off_policy_assignments`:** exceptions, meaning one person on a given policy between two dates.
- **`allowances`:** one person's allowance for one type and one leave year. It has no amount column; its dates are fixed when it is created and never change.
- **`allowance_ledger_lines`:** every change to an allowance (grants, bank holidays, booked days, manual adjustments, rounding), with its effective date, cause and author.
- **`time_off`:** a person's time off and its approval status (`pending_approval`, `approved`, `declined`, `cancelled`).
- **`time_off_days`:** the days of a time off, each a full day, a morning or an afternoon. What a day costs is written as ledger lines, never stored on the day.

## Which policy applies

For one employee, type and date:

1. the person's assignment on that date, if any;
2. otherwise their group's policy for that type;
3. otherwise none, and the person cannot book that type.

An assignment or membership counts only on days the person has an employment.

## Example: joining in October

Sam joins on Monday 12 October 2026 and works Monday to Friday. Sam is on the default Annual leave policy: 28 days for 5, bank holidays included, leave year from 1 January.

Sam is employed for 81 days of the leave year, from 12 October to 31 December:

- grant: 28 × 81 ÷ 365 = 6.214, rounded up to the half day, 6.5;
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
      "amount": "6.214",
      "kind": "entitlement_grant",
      "cause_kind": "employment_started",
      "cause_ref": "emp_sam_employment_1",
      "allowance_rule_id": "rule_everyone_yearly_28_for_5",
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:rule_everyone_yearly_28_for_5:2026-10-12",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_02",
      "allowance_id": "al_01",
      "effective_date": "2026-10-12",
      "unit": "days",
      "amount": "0.286",
      "kind": "rounding_up_to_half_day",
      "cause_kind": "employment_started",
      "cause_ref": "emp_sam_employment_1",
      "allowance_rule_id": null,
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:rounding:2026-10-12",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_03",
      "allowance_id": "al_01",
      "effective_date": "2026-12-25",
      "unit": "days",
      "amount": "-1",
      "kind": "bank_holiday_taken",
      "cause_kind": "bank_holiday",
      "cause_ref": "2026-12-25",
      "allowance_rule_id": null,
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:bank_holiday:2026-12-25",
      "created_at": "2026-10-12T00:00:05Z"
    },
    {
      "id": "ln_04",
      "allowance_id": "al_01",
      "effective_date": "2026-12-28",
      "unit": "days",
      "amount": "-1",
      "kind": "bank_holiday_taken",
      "cause_kind": "bank_holiday",
      "cause_ref": "2026-12-28",
      "allowance_rule_id": null,
      "time_off_day_id": null,
      "reason": null,
      "author_kind": "broccoli_itself",
      "author_id": null,
      "idempotency_key": "al_01:bank_holiday:2026-12-28",
      "created_at": "2026-10-12T00:00:05Z"
    }
  ]
}
```

That gives Sam 6.214 + 0.286 − 1 − 1 = 4.5 days to book in 2026.

- **The allowance covers the whole leave year,** even though Sam joined in October. The start date only shortens the stretch the grant is pro-rated over.
- **Only bank holidays from the start date are charged.** The earlier 2026 bank holidays fall before Sam was employed.
- **On 1 January 2027** Sam gets a new allowance with the full 28 days, less that year's bank holidays.
