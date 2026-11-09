# QA: People directory

A manual check of the People page against a development stack.

## Setup

1. Start the stack and create the owner as in [QA setup](setup.md).
2. Setup always leaves people behind. For the empty state "No people yet", delete them with `docker compose exec postgres psql -U broccoli -c 'DELETE FROM employees'`.
3. Add about 60 employees, leaving some without a job title or start date.

## List and paging

- [ ] `/people` shows 50 people in name order, each with an avatar (initials when there is none), email link, job title and start date as DD/MM/YYYY ("04/03/2024" regardless of browser language; "—" when missing).
- [ ] "Next page" shows the rest; it is disabled on the last page, and "First page" is disabled on the first.
- [ ] Reload keeps the page; the browser Back button returns to the previous page.
- [ ] With 50 people or fewer the footer is hidden.

## Sort and search

- [ ] Clicking Name, Email or Start date sorts ascending, clicking again sorts descending; the caret shows the direction and the URL holds `sort` and `dir`. Job title is not sortable.
- [ ] Sorting works from the keyboard (Tab to the header, Enter).
- [ ] Typing in the search filters by first name, last name, full name or email, ignoring case, after a short pause; the URL holds `q` and the list goes back to the first page.
- [ ] A search without matches shows "No people match “…”"; "Clear search" empties the field and the URL.

## Set manager

As an admin with at least three people (outside the demo):

- [ ] Ticking two people shows "Set manager" beside "Invite"; picking a person sets both, toasts "Set … as manager of 2 people", clears the selection, and each panel shows the manager and a "You set manager to …" history line.
- [ ] Choosing "None" removes their manager.
- [ ] Ticking someone and picking a person who reports to them toasts "That person reports to someone you selected, so they can’t be their manager." and changes nothing.

## Change terms

As an admin, with terms "Scotland" added in Settings › Employment terms (the demo works too; it shows no "Invite"):

- [ ] Ticking three people shows "Change terms" beside "Set manager"; it opens "Change terms for 3 people" with Terms, Applies from (today; nothing before 1 January this year) and "Earlier days stay on their terms."
- [ ] Picking Scotland reads "Saving moves 3 people to Scotland from <today>." with Cancel and "Change terms".
- [ ] A person already on Scotland on that date shows "Already on Scotland on <date>, so they stay as they are: <name>." and isn't counted; with only such people, the footer reads "Nobody here moves to Scotland from <date>." and the button is disabled.
- [ ] A person starting after the date shows under "Start after <date>, so they move from their start date: …"; one with a later planned move to other terms under "Have a later change that stays: <name> moves to <terms> on <date>."
- [ ] More than three names in a line end "and N more".
- [ ] Saving from today toasts "3 people are on Scotland from <today>." (a future date: "… move to Scotland on <date>."), clears the selection, and each panel's Employment terms tab and History show the move.

## Robustness

- [ ] `/people?sort=bogus&dir=sideways&after=junk&q=` opens the normal list.
- [ ] With the API failing, the page shows "Couldn’t load people" and "Try again" reloads the list once the API is back.
- [ ] At a narrow canvas the table scrolls sideways inside its frame, the Name column and header row stay pinned.

## Reset setup

1. On a finished setup, open the workspace menu and choose "Reset setup", then "Cancel": nothing changes.
2. Choose "Reset setup" again and confirm.

- [ ] The dialog reads "Reset setup?" and says everyone in the directory is deleted and setup starts again.
- [ ] Confirming lands on `/setup/company`, still signed in, with the company name and logo filled in.
- [ ] Finishing setup again with a new import shows only the new people on `/people`.
- [ ] During the self-hosted demo the workspace menu shows "Exit demo" and no "Reset setup".
