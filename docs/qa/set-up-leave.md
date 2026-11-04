# QA: Set up leave

A manual check of the "Set up leave" setup page and turning leave on as setup finishes, on both modes, against a development stack.

## Setup

1. Start the stack as in [QA setup](setup.md) and go through setup to the review with a staff file of five people, each with a start date in an earlier year: two at "Glasgow", one at "Leeds", one at "Remote" and one with no location.
2. Nothing in the app shows terms or allowances yet, so the checks after setup read the development database: `docker compose --project-name <the broccoli-dev-… project of this checkout> exec postgres psql -U broccoli broccoli` (`docker compose ls` lists the project).
3. For the AI suggestion, use an instance whose AI source answers (OpenRouter with a key, or Broccoli AI). For the fallback, choose the external agent in Setup AI, or use an OpenRouter source without a key.

## The page

- [ ] Approve lands on "Set up leave", listed as its own step "Leave" after "Add your people" in the step list; Back reopens the review.
- [ ] The "England and Wales terms" card always shows, with "New people start on these terms", Mon–Fri 7.5 hours, England and Wales bank holidays with this year's count, the UK statutory minimum and "Sickness · Family leave · Other".
- [ ] "Which terms each location gets" lists Glasgow, Leeds and Remote. While the AI answers it says "Checking your locations…"; then Glasgow is Scotland, Leeds England and Wales, and Remote England and Wales with "Please check".
- [ ] A "Scotland terms" card shows with Glasgow and 2 people; England and Wales shows Leeds, Remote, "No location (1)" and 3 people.
- [ ] Moving Glasgow to England and Wales removes the Scotland card; moving it back shows the card with the choices it had.
- [ ] Moving Leeds to Northern Ireland shows a "Northern Ireland terms" card; move it back to England and Wales.
- [ ] On another run, with the fallback source, every location starts on England and Wales with "Please check", and the page still works.
- [ ] On another run, a staff file without locations shows only the England and Wales card and no location list.
- [ ] Below 768px wide the cards and the location list stack.
- [ ] Reloading the page, going to "Who uses Broccoli" and back, or Back to the review and Approve again, keeps the choices, including accepted suggestions after Turn on.

## Turning leave on

- [ ] Set Scotland to "25 days plus bank holidays" and "Mon–Thu, 8 hours a day", press Turn on, choose "Only admins" and finish setup.
- [ ] `select e.email, t.name as terms from employee_terms m join employees e on e.id = m.employee_id join terms t on t.id = m.terms_id;` puts the Glasgow people on Scotland and the others on England and Wales.
- [ ] `select p.name, w.monday_minutes, w.friday_minutes, w.bank_holiday_calendar from working_patterns p join working_pattern_weeks w on w.working_pattern_id = p.id;` lists Standard and "Scotland · Mon–Thu, 8 hours" (480, 0, scotland).
- [ ] `select e.email, sum(l.amount) from allowance_ledger_lines l join allowances a on a.id = l.allowance_id join employees e on e.id = a.employee_id group by e.email;` gives every person an allowance; a full-time Glasgow person has 21 days in 2026.
- [ ] Settings → Locations still lists Glasgow, Leeds and Remote.
- [ ] Adding a person at Glasgow through an import after setup puts them on Scotland terms (the first query).
- [ ] On another run, Skip for now, then finishing setup, leaves leave off: `select count(*) from allowances;` is 0 and `select name from terms;` lists only England and Wales.
- [ ] Reset setup after turning leave on, then going through setup again, offers the same page with nothing left from before.
