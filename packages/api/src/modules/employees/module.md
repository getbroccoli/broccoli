# Employees

The people who work for the company, their employments and managers, the policy groups they are in, and their working patterns. This file covers policy groups and working patterns; the rest is described in the code.

## Policy groups

- A **policy group** is a named set of people who share the same settings, such as "Everyone" or "UK office". The migration creates "Everyone"; code finds it by its key, never its name.
- Every new person joins "Everyone" for all dates, however they are created: added by hand, from an import or as demo data.
- Membership is dated (`employee_policy_groups`): a person is in one group at a time and can move on an exact date.
- A person in no group gets no group settings: no working pattern and no time off unless they have their own assignment. This is how someone like a non-executive director stays out of both.

## Working patterns

A working pattern is the minutes a person works on each weekday, Monday to Sunday, from a date. Time off reads it to pro-rate allowances, charge bank holidays and cost leave; time tracking and payroll will read it later.

### Data model

- **`working_pattern_policies`:** a named way of working, such as "Standard" or "Part-time Tue–Thu". The migration creates Standard (key `standard_working_pattern`), which cannot be deleted.
- **`working_pattern_weeks`:** a policy's minutes for each weekday and its full day, from a date until its next week. A policy's first week has no date: it applies from the beginning.
- **`policy_group_working_patterns`:** which policy a group works by default, from a date to a date. Standard is linked to "Everyone" for all dates.
- **`employee_working_pattern_assignments`:** one person's own policy between two dates, ahead of their group's.

### Which working pattern applies

For one person on one date:

1. their own assignment on that date, if any;
2. otherwise the policy their group works on that date;
3. otherwise none.

The policy's week on that date gives the minutes and the full day.

### Rules

- Every change is dated, and earlier dates keep what they had. A change with a past date is a correction; replacing a row on the same date or removing one is a correction too.
- A policy's minutes change by adding a week from a date. A group changes policy by ending its link and starting a new one; a person's own assignment works the same way.
- The **full day** is the minutes one day of leave stands for. It is at least the longest weekday, so a day of leave never costs more than 1. Time off costs a day as that day's minutes ÷ the full day.
- Only admins change policies, group links and assignments. A person's working pattern is readable by them, everyone above them in the reporting line, and admins.
- Changes to a person's own assignment are written to their history as the `working_pattern` record type, which only readers of their working pattern see.
- Every change that can move someone's working weeks publishes `employees.working_pattern_changed` with the people concerned and the first date that changed. Other modules read working weeks through `WorkingPatternService.readWorkingWeeks`, never these tables.

### Example: part-time from September

Sam is in "Everyone" and works Standard. From 1 September Sam works a part-time policy of their own, until the end of November.

```json
{
  "working_pattern_policies": [
    { "id": "wpp_standard", "name": "Standard", "key": "standard_working_pattern" },
    { "id": "wpp_part_time", "name": "Part-time Tue–Thu", "key": null }
  ],
  "working_pattern_weeks": [
    {
      "working_pattern_policy_id": "wpp_standard",
      "effective_from": null,
      "monday_minutes": 450,
      "tuesday_minutes": 450,
      "wednesday_minutes": 450,
      "thursday_minutes": 450,
      "friday_minutes": 450,
      "saturday_minutes": 0,
      "sunday_minutes": 0,
      "full_day_minutes": 450
    },
    {
      "working_pattern_policy_id": "wpp_part_time",
      "effective_from": null,
      "monday_minutes": 0,
      "tuesday_minutes": 450,
      "wednesday_minutes": 450,
      "thursday_minutes": 450,
      "friday_minutes": 0,
      "saturday_minutes": 0,
      "sunday_minutes": 0,
      "full_day_minutes": 450
    }
  ],
  "policy_group_working_patterns": [
    {
      "policy_group_id": "group_everyone",
      "working_pattern_policy_id": "wpp_standard",
      "effective_from": null,
      "effective_until": null
    }
  ],
  "employee_working_pattern_assignments": [
    {
      "employee_id": "emp_sam",
      "working_pattern_policy_id": "wpp_part_time",
      "effective_from": "2026-09-01",
      "effective_until": "2026-11-30"
    }
  ]
}
```

Reading Sam's working weeks for 2026 returns:

```json
[
  {
    "effectiveFrom": "2026-01-01",
    "minutes": [450, 450, 450, 450, 450, 0, 0],
    "fullDayMinutes": 450
  },
  { "effectiveFrom": "2026-09-01", "minutes": [0, 450, 450, 450, 0, 0, 0], "fullDayMinutes": 450 },
  {
    "effectiveFrom": "2026-12-01",
    "minutes": [450, 450, 450, 450, 450, 0, 0],
    "fullDayMinutes": 450
  }
]
```

Sam is back on the group's pattern from 1 December. Had an admin later changed Standard to 480 minutes from 1 January 2027, Sam's 2026 weeks would read the same.
