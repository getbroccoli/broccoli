# Employees

The people who work for the company, their employments and managers, the terms they are on, and their working patterns. This file covers terms and working patterns; the rest is described in the code.

## Terms

- **Terms** are a named set of people who share the same working pattern and time off policies, such as "England and Wales" or "UK office". The migration creates "England and Wales"; code finds them by their key, never their name.
- Every new person starts on "England and Wales" for all dates, however they are created: added by hand, from an import or as demo data.
- Membership is dated (`employee_terms`): a person is on one set of terms at a time and can move on an exact date.
- A person on no terms gets no terms settings: no working pattern and no time off unless they have their own assignment. This is how someone like a non-executive director stays out of both.

## Working patterns

A working pattern is the minutes a person works on each weekday, Monday to Sunday, from a date. Time off reads it to pro-rate allowances, charge bank holidays and cost leave; time tracking and payroll will read it later.

### Data model

- **`working_patterns`:** a named way of working, such as "Standard" or "Part-time Tue–Thu". The migration creates Standard (key `standard_working_pattern`), which cannot be deleted.
- **`working_pattern_weeks`:** a pattern's minutes for each weekday, its full day and its bank holiday calendar, from a date until its next week. A pattern's first week has no date: it applies from the beginning.
- **`terms_working_patterns`:** which working pattern the people on terms work by default, from a date to a date. Standard is linked to "England and Wales" for all dates.
- **`employee_working_pattern_assignments`:** one person's own working pattern between two dates, ahead of their terms'.

### Which working pattern applies

For one person on one date:

1. their own assignment on that date, if any;
2. otherwise the working pattern their terms work on that date;
3. otherwise none.

That pattern's week on that date gives the minutes, the full day and whose bank holidays apply.

### Rules

- Every change is dated, and earlier dates keep what they had. A change with a past date is a correction; replacing a row on the same date or removing one is a correction too.
- A pattern's minutes change by adding a week from a date. Terms change pattern by ending their link and starting a new one; a person's own assignment works the same way.
- The **full day** is the minutes one day of leave stands for. It is at least the longest weekday, so a day of leave never costs more than 1. Time off costs a day as that day's minutes ÷ the full day.
- Only admins change working patterns, terms links and assignments. A person's working pattern is readable by them, everyone above them in the reporting line, and admins.
- Changes to a person's own assignment are written to history as the `working_pattern` record type, apart from the employee's own history, since not everyone who reads a person may read their working pattern. Resetting all employees purges both.
- Every change that can move someone's working weeks publishes `employees.working_pattern_changed` with the people concerned and the first date that changed. Other modules read working weeks through `WorkingPatternService.readWorkingWeeks`, never these tables.

### Bank holidays

- Each pattern week names a **bank holiday calendar**: `england_and_wales` (the default, and Standard's), `scotland` or `northern_ireland`. Someone moving to Glasgow from 1 July is put on a Scotland pattern from 1 July, so earlier bank holidays keep England and Wales.
- Changing a pattern's calendar is a new week from a date, like a change of minutes. A change that gives no calendar keeps the one in force on its date.
- The calendars and their dates belong to the [bank holidays module](../bankHolidays/module.md).

### Example: part-time from September

Sam is on "England and Wales" and works Standard. From 1 September Sam works a part-time pattern of their own, until the end of November.

```json
{
  "working_patterns": [
    { "id": "wp_standard", "name": "Standard", "key": "standard_working_pattern" },
    { "id": "wp_part_time", "name": "Part-time Tue–Thu", "key": null }
  ],
  "working_pattern_weeks": [
    {
      "working_pattern_id": "wp_standard",
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
      "working_pattern_id": "wp_part_time",
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
  "terms_working_patterns": [
    {
      "terms_id": "terms_england_and_wales",
      "working_pattern_id": "wp_standard",
      "effective_from": null,
      "effective_until": null
    }
  ],
  "employee_working_pattern_assignments": [
    {
      "employee_id": "emp_sam",
      "working_pattern_id": "wp_part_time",
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

Sam is back on the terms' pattern from 1 December. Had an admin later changed Standard to 480 minutes from 1 January 2027, Sam's 2026 weeks would read the same.
