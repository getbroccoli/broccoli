# QA: Set up time off

A manual check of the "Set up time off" setup page and turning time off on as setup finishes, on both modes, against a development stack.

## Setup

1. Start the stack as in [QA setup](setup.md) and go through setup to the review with a staff file of five people, each with a start date in an earlier year: two at "Glasgow", one at "Leeds", one at "Remote" and one with no location.
2. Nothing in the app shows terms or allowances yet, so the checks after setup read the development database: `docker compose --project-name <the broccoli-dev-… project of this checkout> exec postgres psql -U broccoli broccoli` (`docker compose ls` lists the project).
3. For the AI suggestion, use an instance whose AI source answers (OpenRouter with a key, or Broccoli AI). For the fallback, choose the external agent in Setup AI, or use an OpenRouter source without a key.

## The page

- [ ] Approve lands on the page titled "Company defaults", listed as its own step "Company defaults" after "Add your people" in the step list; the description counts the 5 people; from 1024px wide the part-timers tip sits right of the questions; Back reopens the review.
- [ ] 1 "How much holiday do people get?" offers 20 days ("Most common", selected), 25 days and 28 days ("Legal minimum · bank holidays booked from these"); with Glasgow on Scotland and the rest on England and Wales, 20 and 25 say "Bank holidays on top, by each person's calendar". On the run without locations they say "Bank holidays on top · 28 days off in all" and "… 33 days off in all" for England and Wales.
- [ ] 2 "What is a usual working week?" offers four weeks with their hours a week and working days marked; Mon–Fri, 7.5 h a day is selected.
- [ ] 3 "Which bank holidays are days off?" lists Glasgow (2 people), Leeds and Remote (1 person each). While the AI answers it says "Checking your locations…" and "Turn on time off" is disabled; then Glasgow is Scotland · 10, Leeds England and Wales · 8, and Remote England and Wales with "Please check"; a "No location" row shows 1 person on England and Wales · 8.
- [ ] "Also ready from day one" shows Sickness, Family leave and Other.
- [ ] On another run, with the fallback source, every location starts on England and Wales with "Please check", and the page still works.
- [ ] On another run, a staff file without locations says "Your file had no locations, so everyone gets one calendar." and offers England and Wales (selected), Scotland and Northern Ireland with this year's counts.
- [ ] Below 640px wide the cards and the location rows stack and nothing scrolls sideways.
- [ ] Reloading the page, going to "Who uses Broccoli" and back, or Back to the review and Approve again, keeps the choices, including accepted suggestions after "Turn on time off".

## Turning time off on

- [ ] Choose 25 days and Mon–Thu, 8 h a day, press "Turn on time off", choose "Only admins" and finish setup.
- [ ] `select e.email, t.name as terms from employee_terms m join employees e on e.id = m.employee_id join terms t on t.id = m.terms_id;` puts the Glasgow people on Scotland and the others on England and Wales.
- [ ] `select p.name, w.monday_minutes, w.friday_minutes, w.bank_holiday_calendar from working_patterns p join working_pattern_weeks w on w.working_pattern_id = p.id;` lists Standard, "England and Wales · Mon–Thu, 8 hours" (480, 0, england_and_wales) and "Scotland · Mon–Thu, 8 hours" (480, 0, scotland).
- [ ] `select e.email, sum(l.amount) from allowance_ledger_lines l join allowances a on a.id = l.allowance_id join employees e on e.id = a.employee_id group by e.email;` gives every person an allowance; a full-time Glasgow person has 21 days in 2026.
- [ ] Settings → Locations still lists Glasgow, Leeds and Remote.
- [ ] Adding a person at Glasgow through an import after setup puts them on Scotland terms (the first query).
- [ ] On another run without locations, choosing Scotland and finishing setup renames the default terms: `select name, key from terms;` lists only "Scotland" (`default_terms`), every person is on it, and its pattern's bank holiday calendar is scotland.
- [ ] On another run, "Skip, turn on later", then finishing setup, leaves time off off: `select count(*) from allowances;` is 0 and `select name from terms;` lists only England and Wales.
- [ ] Reset setup after turning time off on, then going through setup again, offers the same page with nothing left from before, and `select name from terms;` lists only England and Wales.
