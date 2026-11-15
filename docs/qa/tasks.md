# QA: Tasks

A manual check of My tasks, against a development stack.

## Setup

1. Start the stack and choose "Explore the demo" as in [QA setup](setup.md). The demo's owner is Oliver Bennett, who holds the demo's tasks; the profile menu shows his name.
2. Open Tasks from the menu.

## The page

- [ ] Tasks follows Today in the menu, above People, with a count of 2.
- [ ] An owner with an account (see "Create the owner" in [QA setup](setup.md)) lands on Today (`/`) after signing in; "Tasks" in the menu opens `/tasks`.
- [ ] Under the title: "2 things need you. Everything else you asked for is below."
- [ ] One table with Task, Type, From and Due. Needs you lists "Sign James Whitfield's new contract" (Due in amber, "Late, was …") then "Approve the hiring plan for next quarter", each from Priya Shah with Mark done.
- [ ] Waiting on others lists "Agree the updated expenses policy" ("With James Whitfield", from You) and "Check the laptop budget for new starters" ("With Priya Shah", from You).
- [ ] An owner who is no employee, such as one created after the demo started from a terminal, sees "Nothing is asked of you right now." and no count.
- [ ] At phone width the table scrolls sideways in its box.

## Mark done

- [ ] Mark done on a row turns it to Done ("Done by you · <today>"), the count goes down by one and a toast says "Marked done", with no Undo. After a reload the done task sits under Resolved recently.

## A task

- [ ] Clicking a row opens the task at `/tasks/<id>`: the asker's avatar, the title, the status, "What Priya asks" with the description and due date, "If you mark it done: Priya sees it as done in Tasks." and "Asked by Priya Shah on …".
- [ ] History lists "Broccoli asked for “…”" for a demo task; Mark done adds "You marked it done" at the top without a reload.
- [ ] A done task you hold has no "…" menu: done is final.
- [ ] On "Check the laptop budget for new starters", which you asked for, "…" offers Delete task. "Delete this task?" names Priya; Keep it leaves it, Delete task closes the panel, says "Task deleted" and the task is gone from Waiting on others.
- [ ] An unknown id, such as `/tasks/00000000-0000-4000-8000-000000000001`, says "This task is not yours to see, or it is gone."
- [ ] At phone width the panel is full screen.

## Task emails

Mailpit catches every email in development; open it from the address `pnpm dev` prints. No screen creates a task for a person who joined yet, so this uses a terminal and the development database (`docker exec <dev postgres container> psql -U broccoli -d broccoli`).

1. Start the demo from a terminal and create the owner, as in [QA setup](setup.md). Link the owner to Oliver Bennett: `update employees set user_id = (select owner_user_id from instance) where email = 'oliver.bennett@example.com'`.
2. Add Avery as "Add employees" in [QA setup](setup.md) shows, invite her from People and join from the invite in Mailpit, in a private window.

- [ ] Starting the demo sends no task email: its tasks email nobody.
- [ ] Turn on a process that gives the owner a task when a person is added (insert one on `employees.added` with `"run": "after_commit"` and a `task` step for the `workspace_owner`), then add another person: within seconds Oliver gets "New task: …" from Acme Corp, with the description, "Due …", Open task and the task's link.
- [ ] Insert a `manual_to_do` that Oliver asks of Avery. As Avery, Mark done: Oliver gets "Avery Abbott marked done: …" from "Avery Abbott via Acme Corp", with "Done by Avery Abbott on <today>".
- [ ] Signed out, the email's link asks Oliver to sign in, then opens the task at `/tasks/<id>`.
- [ ] As Oliver, Mark done the process task: nobody gets an email, since nobody asked for it.
