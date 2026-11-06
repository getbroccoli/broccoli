# Employees

The people who work for the company, their employments and managers, the terms they are on, and their working patterns. This file covers terms and working patterns; the rest is described in the code.

## Terms

- **Terms** are a named set of people who share the same working pattern and time off policies, such as "England and Wales" or "UK office". Names are unique ignoring case. The migration creates only the default terms, "England and Wales" (key `default_terms`, with their own pattern of Monday to Friday, 7.5 hours a day); code finds them by their key, never their name, since turning time off on can give them another nation's name.
- Every new person starts, for all dates, on their location's default terms (`locations.default_terms_id`), else on the default terms, however they are created: added by hand, from an import or as demo data. Changing a person's location never changes their terms.
- Turning time off on (`EmployeeSetupService.setUpTerms`, called by time off) sets terms up per nation: the default terms take the default nation (England and Wales unless the owner picked another for a staff file without locations), renamed after it; the other nations' terms are created when a location needs them. New terms get a pattern of their own on their standard working week and nation's bank holidays; the default terms' own pattern takes the chosen week and calendar, unless it is already on them. It creates missing named locations and points each at its nation's terms before setup imports the people, so they join those terms directly. Existing memberships and own pattern assignments stay unchanged.
- The standard working weeks are code constants (`domain/standardWorkingWeek.ts`): Monday to Friday at 7.5, 8 or 7 hours, and Monday to Thursday at 8 hours.
- Reset setup and Exit demo (`deleteAllEmployees`) delete every terms but the default ones, with their patterns, and every named pattern, and put the default terms back on their seeded week, named "England and Wales".
- Membership is dated (`employee_terms`): a person is on one set of terms at a time and can move on an exact date.
- A person on no terms gets no terms settings: no working pattern and no time off unless they have their own assignment. This is how someone like a non-executive director stays out of both.

## Working patterns

A working pattern is the minutes a person works on each weekday, Monday to Sunday, from a date. Time off reads it to pro-rate allowances, charge bank holidays and cost leave; time tracking and payroll will read it later.

### Data model

- **`working_patterns`:** a way of working. Each set of terms has exactly one of its own (`terms_id`, no name); the others are named, such as "Part-time Tue–Thu", and put on people one by one.
- **`working_pattern_versions`:** a pattern's minutes for each weekday, its full day and its bank holiday calendar, from `start_date` to `end_date`. A pattern's versions never overlap; its first has no start date: it applies from the beginning.
- **`employee_working_pattern_assignments`:** one person on a named pattern between two dates, ahead of their terms'. A terms' own pattern is never assigned to a person.

### Which working pattern applies

For one person on one date:

1. their own assignment on that date, if any;
2. otherwise their terms' own pattern on that date;
3. otherwise none.

That pattern's version on that date gives the minutes, the full day and whose bank holidays apply. The same rule picks a person's time off policy for a type, so one resolver serves both (`domain/personTimeline.ts`).

### Rules

- Every change is dated, and earlier dates keep what they had. A change with a past date is a correction; replacing a row on the same date or removing one is a correction too.
- A version is never edited: a change ends the version covering its date the day before and adds one from it; removing a version extends the one before it to its end. A person's own assignment changes the same way.
- A terms' own pattern changes only through its versions and goes with its terms; it cannot be renamed, deleted or assigned on its own.
- The **full day** is the minutes one day of leave stands for. It is at least the longest weekday, so a day of leave never costs more than 1. Time off costs a day as that day's minutes ÷ the full day.
- Only admins change working patterns and assignments. A person's working pattern is readable by them, everyone above them in the reporting line, and admins.
- Changes to a person's own assignment are written to history as the `working_pattern` record type, apart from the employee's own history, since not everyone who reads a person may read their working pattern; a terms' own pattern appears under the terms' name. Resetting all employees purges both.
- Every change that can move someone's working weeks publishes `employees.working_pattern_changed` with the people concerned and the first date that changed. Other modules read working weeks through `WorkingPatternService.readWorkingWeeks`, never these tables.

### Bank holidays

- Each pattern version names a **bank holiday calendar**: `england_and_wales` (the default), `scotland` or `northern_ireland`. Someone moving to Glasgow from 1 July is put on a Scotland pattern from 1 July, so earlier bank holidays keep England and Wales.
- Changing a pattern's calendar is a new version from a date, like a change of minutes. A change that gives no calendar keeps the one in force on its date.
- The calendars and their dates belong to the [bank holidays module](../bankHolidays/module.md).

### Example: part-time from September

Sam is on "England and Wales" and works their pattern. From 1 September Sam works a part-time pattern of their own, until the end of November.

```json
{
  "working_patterns": [
    { "id": "wp_england_and_wales", "terms_id": "terms_england_and_wales", "name": null },
    { "id": "wp_part_time", "terms_id": null, "name": "Part-time Tue–Thu" }
  ],
  "working_pattern_versions": [
    {
      "working_pattern_id": "wp_england_and_wales",
      "start_date": null,
      "end_date": null,
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
      "start_date": null,
      "end_date": null,
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
  "employee_working_pattern_assignments": [
    {
      "employee_id": "emp_sam",
      "working_pattern_id": "wp_part_time",
      "start_date": "2026-09-01",
      "end_date": "2026-11-30"
    }
  ]
}
```

Reading Sam's working weeks for 2026 returns:

```json
[
  {
    "startDate": "2026-01-01",
    "minutes": [450, 450, 450, 450, 450, 0, 0],
    "fullDayMinutes": 450
  },
  { "startDate": "2026-09-01", "minutes": [0, 450, 450, 450, 0, 0, 0], "fullDayMinutes": 450 },
  {
    "startDate": "2026-12-01",
    "minutes": [450, 450, 450, 450, 450, 0, 0],
    "fullDayMinutes": 450
  }
]
```

Sam is back on the terms' pattern from 1 December. Had an admin later changed the terms' pattern to 480 minutes from 1 January 2027, Sam's 2026 weeks would read the same.
