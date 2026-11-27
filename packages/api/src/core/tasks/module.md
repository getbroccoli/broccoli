# Tasks

A task is work asked of one person, its assignee: by a person who asked (`manual_to_do`), or by a feature such as a process step, which names its own type and may name who asked, such as an approval's requester. Tasks know no feature: a feature follows its tasks through their events. Only the assignee and the person who asked see a task; anyone else gets "No task has this id.", so a task's existence does not leak. The person a task is about never sees it for that reason alone.

## Rules

- A task asks for work and never grants authority. A feature creates its tasks with `TaskService.createTasks` in its own transaction, passing an unstored `sourceKey` that `tasks.task_created` publishes.
- Statuses: `to_do`, `done` and `cancelled`; done and cancelled are final. Only the assignee marks a to-do done, whatever created it; a feature follows from `tasks.task_status_changed` before the commit. Only the person who asked deletes an open manual to-do; a feature's task is never deleted. Only the feature that created a task cancels it, with a reason its assignee reads (`cancelInTransaction`).
- A task may ask its assignee for a result (`result_form`, which a feature such as a process step copies onto it): one of a form's options (`kind` `choice`, shown as `buttons`, at most three, or `choices`), with a comment when the option requires one. Its assignee gives it with the ordinary Mark done; a task with a form refuses Mark done without one, and one without a form refuses a result. The result is final, published with `tasks.task_status_changed`, and its history line reads "No — VPN login fails". Features match a result's `code`, never its label.
- A connected agent decides only through a card it showed the person: `issueDecisionToken` gives the card a one-time token (an hour, that user and agent connection, the holder's open task with a form; only its hash is stored in `task_decision_tokens`), and `markDone` under an agent context refuses any decision without it, using it up in the decision's transaction.
- The first change wins: each change locks the task's row, so a second Mark done gets "This task is already done."
- Every change appends a history line for record type `task`, in its transaction, and returns it. Tasks register their own reading rule with core's records: `recordHistory` and `Task.history` serve a task's lines to its assignee and the person who asked, and refuse anyone else.
- Deleting the assignee or the person who asked deletes the task; deleting the person it is about or who finished it leaves it, without them. Reset setup and Exit demo forget the tasks' history. A deleted task's history line records its deletion.

## Data model

- **`tasks`:** `type` (`manual_to_do`, or a feature's own type such as `process_step_to_do`), `status`, `title`, `description`, `assignee_employee_id` (the assignee), `asked_by_employee_id`, `subject_employee_id`, the record it acts on (`record_type`, `record_id`), `due_date`, the done and cancelled columns that follow the status, `result_form`, and `result_code` and `result_comment` once done. Checks keep a manual to-do with someone who asked, and the columns matching its status.

## My tasks

`TaskService.listMyTasks` groups the caller's tasks by where the ball is: **Needs you** (tasks they hold to do, by due date), **Waiting on others** (open tasks they asked someone else for) and **Resolved recently** (done or cancelled in the last 14 days, newest first).
