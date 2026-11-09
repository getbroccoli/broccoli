# QA: Tasks

A manual check of My tasks, against a development stack.

## Setup

1. Start the stack and create the owner with the demo company as in [QA setup](setup.md).
2. Link the owner to Oliver Bennett, who holds the demo's tasks: in the development database, `update employees set user_id = (select id from "user" where email = 'owner@example.com') where email = 'oliver.bennett@example.com';`
3. Sign in as `owner@example.com`.

## The page

- [ ] Signing in lands on `/tasks`. Tasks is first in the menu, above People, with a count of 2.
- [ ] Under the title: "2 things need you. Everything else you asked for is below."
- [ ] One table with Task, Type, From, Due and Where it is. Needs you lists "Sign James Whitfield's new contract" (Due in amber, "Late, was …") then "Approve the hiring plan for next quarter", each from Priya Shah with Mark done.
- [ ] Waiting on others lists "Agree the updated expenses policy" (Waiting, from James Whitfield) and "Check the laptop budget for new starters" ("With Priya Shah", from You).
- [ ] An owner without a linked employee sees "Nothing is asked of you right now." and no count.
- [ ] At phone width the table scrolls sideways in its box.

## Mark done

- [ ] Mark done on a row turns it to Done ("Done by you · <today>"), the count goes down by one and a toast says "Marked done" with Undo.
- [ ] Undo turns it back to To do. After a reload a done task sits under Resolved recently.

## A task

- [ ] Clicking a row opens the task at `/tasks/<id>`: the asker's avatar, the title, the status, "What Priya asks" with the description and due date, "If you mark it done: Priya sees it as done in Tasks." and "Asked by Priya Shah on …".
- [ ] A waiting task has no Mark done and says "It cannot be marked done while it waits."
- [ ] On a done task you hold, "…" offers Reopen, which turns it back to To do.
- [ ] On "Check the laptop budget for new starters", which you asked for, "…" offers Cancel task. Confirming without a reason says "Say why you are cancelling it."; with one, the task shows Cancelled and "Cancelled on …: <reason>".
- [ ] An unknown id, such as `/tasks/00000000-0000-4000-8000-000000000001`, says "This task is not yours to see, or it is gone."
- [ ] At phone width the panel is full screen.
