# QA: Tasks

A manual check of My tasks, against a development stack.

## Setup

1. Start the stack and choose "Explore the demo" as in [QA setup](setup.md). The demo's owner is Oliver Bennett, who holds the demo's tasks; the profile menu shows his name.
2. Open Tasks from the menu.

## The page

- [ ] Tasks follows Today in the menu, above People, with a count of 2.
- [ ] An owner with an account (see "Create the owner" in [QA setup](setup.md)) lands on Today (`/`) after signing in; "Tasks" in the menu opens `/tasks`.
- [ ] Under the title: "2 things need you. Everything else you asked for is below."
- [ ] One table with Task, Type, From, Due and Where it is. Needs you lists "Sign James Whitfield's new contract" (Due in amber, "Late, was …") then "Approve the hiring plan for next quarter", each from Priya Shah with Mark done.
- [ ] Waiting on others lists "Agree the updated expenses policy" (Waiting, from James Whitfield) and "Check the laptop budget for new starters" ("With Priya Shah", from You).
- [ ] An owner who is no employee, such as one created after the demo started from a terminal, sees "Nothing is asked of you right now." and no count.
- [ ] At phone width the table scrolls sideways in its box.

## Mark done

- [ ] Mark done on a row turns it to Done ("Done by you · <today>"), the count goes down by one and a toast says "Marked done" with Undo.
- [ ] Undo turns it back to To do. After a reload a done task sits under Resolved recently.

## A task

- [ ] Clicking a row opens the task at `/tasks/<id>`: the asker's avatar, the title, the status, "What Priya asks" with the description and due date, "If you mark it done: Priya sees it as done in Tasks." and "Asked by Priya Shah on …".
- [ ] History lists "Broccoli asked for “…”" for a demo task; Mark done adds "You marked it done" at the top without a reload, and Reopen adds "You reopened it".
- [ ] A waiting task has no Mark done and says "It cannot be marked done while it waits."
- [ ] On a done task you hold, "…" offers Reopen, which turns it back to To do.
- [ ] On "Check the laptop budget for new starters", which you asked for, "…" offers Cancel task. Confirming without a reason says "Say why you are cancelling it."; with one, the task shows Cancelled and "Cancelled on …: <reason>".
- [ ] An unknown id, such as `/tasks/00000000-0000-4000-8000-000000000001`, says "This task is not yours to see, or it is gone."
- [ ] At phone width the panel is full screen.
