# QA: People directory

A manual check of the People page against a development stack.

## Setup

1. Start the stack and create the owner as in [QA setup](setup.md).
2. Saving the company fills the instance with demo data; clear it from the banner ("Clear demo data"). `/people` then shows the empty state "No people yet".
3. Add about 60 employees, leaving some without a job title or start date.

## List and paging

- [ ] `/people` shows 50 people in name order, each with an avatar (initials when there is none), email link, job title and start date ("4 Mar 2024"; "—" when missing).
- [ ] "Next page" shows the rest; it is disabled on the last page, and "First page" is disabled on the first.
- [ ] Reload keeps the page; the browser Back button returns to the previous page.
- [ ] With 50 people or fewer the footer is hidden.

## Sort and search

- [ ] Clicking Name, Email or Start date sorts ascending, clicking again sorts descending; the caret shows the direction and the URL holds `sort` and `dir`. Job title is not sortable.
- [ ] Sorting works from the keyboard (Tab to the header, Enter).
- [ ] Typing in the search filters by first name, last name or email after a short pause; the URL holds `q` and the list goes back to the first page.
- [ ] A search without matches shows "No people match “…”"; "Clear search" empties the field and the URL.

## Robustness

- [ ] `/people?sort=bogus&dir=sideways&after=junk&q=` opens the normal list.
- [ ] With the API failing, the page shows "Couldn’t load people" and "Try again" reloads the list once the API is back.
- [ ] At a narrow canvas the table scrolls sideways inside its frame, the Name column and header row stay pinned.
