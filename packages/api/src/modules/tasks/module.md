# Tasks

A task is work asked of one person, its assignee. The person who asked, or the process step that created it, is its source. Only the assignee and the person who asked see a task; anyone else gets "No task has this id.", so a task's existence does not leak. The person a task is about never sees it for that reason alone.

## Rules

- A task asks for work and never grants authority. A feature creates its tasks with `TaskService.createTask` in its own transaction and finishes them with its own command, under the caller's permissions.
- Statuses: `to_do`, `waiting`, `done` and `cancelled`. Only the assignee marks a to-do done or reopens it; only the person who asked cancels it, with a reason. A task created by a process step, with no person who asked, is cancelled only by its feature.
- The first change wins: each change locks the task's row, so a second Mark done gets "This task is already done."
- Every change appends a history line for record type `task`, in its transaction, and returns it. Tasks register their own reading rule with core's records: `recordHistory` and `Task.history` serve a task's lines to its assignee and the person who asked, and refuse anyone else.
- Deleting the assignee or the person who asked deletes the task; deleting the person it is about or who finished it leaves it, without them. Reset setup and Exit demo forget the tasks' history.

## Data model

- **`tasks`:** `type` (`manual_to_do`, finished by hand), `status`, `title`, `description`, `assignee_employee_id` (the assignee), `asked_by_employee_id`, `subject_employee_id`, the process source (`process_key`, `process_run_id`, `step_key`; no foreign key to runs until runs exist), the subject record (`record_type`, `record_id`), `due_date`, and the done and cancelled columns that follow the status. Checks keep a task asked by someone (a person or a process step) and the columns matching its status.

## My tasks

`TaskService.listMyTasks` groups the caller's tasks by where the ball is: **Needs you** (tasks they hold to do, by due date), **Waiting on others** (open tasks they asked someone else for, and their own waiting tasks) and **Resolved recently** (done or cancelled in the last 14 days, newest first).
