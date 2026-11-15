# Processes

A process gives people tasks when something happens to a record, and follows each run of it to its end. Two are ready-made: **Welcome a new starter**, which on a person's start date gives their manager "Have a welcome 1:1" and the person "Have coffee calls with 3 colleagues"; and the **Onboarding example**, whose last step, "Check that your accounts work", waits until the owner has provisioned the person's accounts.

## How a run works

Ids are shortened; columns are shown as rows are stored.

### From a change: a person is added

1. A process version's definition listens to the employees module's event:

   ```json
   {
     "subject": { "recordType": "employee" },
     "trigger": {
       "kind": "on_event",
       "event": "employees.added",
       "run": "in_same_transaction",
       "faultMode": "rollback_transaction"
     },
     "steps": [
       {
         "key": "order_laptop",
         "kind": "task",
         "task": {
           "assignee": { "kind": "subjects_manager", "otherwise": { "kind": "workspace_owner" } },
           "title": "Order a laptop for {firstName}",
           "description": null,
           "due": { "amount": 3, "unit": "business_days" }
         }
       }
     ]
   }
   ```

2. Adding Ada publishes, inside the transaction that adds her:

   ```json
   { "id": "ev1", "type": "employees.added", "payload": { "employeeIds": ["ada"] } }
   ```

3. Before that transaction commits, `startRunsOnEvents` starts one run per added person. Ada has no manager, so the owner gets the task with a note:

   ```json
   // process_runs
   { "id": "run1", "record_type": "employee", "record_id": "ada", "subject_employee_id": "ada",
     "start_cause": "started_on_event", "start_key": "on_event:ev1:ada", "start_day": "2026-11-16",
     "trigger_event": { "id": "ev1", "type": "employees.added", "payload": { "employeeIds": ["ada"] } },
     "status": "in_progress" }
   // process_run_step_progress
   { "run_id": "run1", "step_key": "order_laptop", "status": "step_awaiting_task_completion",
     "task_id": "t1", "assignee_note": "assignee_is_owner_because_subject_has_no_manager" }
   // tasks
   { "id": "t1", "type": "process_step_to_do", "status": "to_do", "title": "Order a laptop for Ada",
     "assignee_employee_id": "owner", "subject_employee_id": "ada",
     "record_type": "employee", "record_id": "ada", "due_date": "2026-11-19" }
   ```

4. The owner marks `t1` done with the ordinary task command, which publishes:

   ```json
   {
     "type": "tasks.task_status_changed",
     "payload": { "taskId": "t1", "from": "to_do", "to": "done", "byEmployeeId": "owner" }
   }
   ```

5. In the same transaction, processes completes the step and, with no step left open, finishes the run:

   ```json
   // process_run_step_progress
   { "run_id": "run1", "step_key": "order_laptop", "status": "step_completed", "finished_at": "…" }
   // process_runs
   { "id": "run1", "status": "finished" }
   ```

If starting the run fails, adding Ada fails too: the run and the change commit together or not at all.

### From a date: Welcome a new starter

The daily job finds people whose `startDate` is today, or up to `maxDaysLate` (7) days ago, without a run of this process, and starts one per person in its own transaction:

```json
// process_runs
{ "id": "run2", "record_type": "employee", "record_id": "ben", "subject_employee_id": "ben",
  "start_cause": "started_on_record_date", "trigger_date": "2026-11-16",
  "start_key": "on_record_date:employee:ben:2026-11-16", "start_day": "2026-11-16",
  "status": "in_progress" }
// process_run_step_progress: one row per step, each with its task
{ "run_id": "run2", "step_key": "welcome_one_to_one", "status": "step_awaiting_task_completion", "task_id": "t2" }
{ "run_id": "run2", "step_key": "coffee_calls", "status": "step_awaiting_task_completion", "task_id": "t3" }
```

Ben's manager's task is due the same day, and Ben's own task five of his working days later. From there the run finishes as in steps 4 and 5. The unique `start_key` keeps a second pass from starting it again.

### A step that waits: the Onboarding example

A step lists the steps it waits for in `after`; with none, it starts with the run:

```json
{ "key": "ensure_provision", "kind": "task", "after": ["provision_accounts"], "task": { … } }
```

The run stores it waiting, without a task, beside the three steps that started:

```json
// process_run_step_progress
{ "run_id": "run3", "step_key": "provision_accounts", "status": "step_awaiting_task_completion", "task_id": "t6" }
{ "run_id": "run3", "step_key": "ensure_provision", "status": "step_waiting_to_start", "task_id": null }
```

When the owner marks `t6` done, the same transaction completes that step and starts the waiting one with its task:

```json
{ "run_id": "run3", "step_key": "provision_accounts", "status": "step_completed" }
{ "run_id": "run3", "step_key": "ensure_provision", "status": "step_awaiting_task_completion", "task_id": "t7" }
```

## Rules

- A process is off until an admin turns it on (`MANAGE_WORKSPACE`); turning it on or off appends a history line for record type `process`, which only those who manage the workspace read. Turning it on starts today's due runs at once, and never anyone whose date was before that day.
- What a process does lives in its published version's definition (JSON, read by `parseProcessDefinition` for the `definition_schema_version` it was written in). A published version never changes; a new release ships a new version. The trigger fires on a record's date plus an offset (`on_record_date`, a date field its record type registered, such as an employee's `startDate`), or on a domain event (`on_event`); schedule triggers are refused. A definition naming a record type, date field or event nobody registered is refused.
- An `on_event` trigger names an event its publishing module registered as triggering (`employees.added`, and `tasks.task_created` and `tasks.task_status_changed`, which processes registers for tasks), with an optional `when` on one payload field, and a `run` mode. `in_same_transaction` (with `faultMode` `rollback_transaction`): before the change commits, `startRunsOnEvents` starts one run per event and record the event is about, batched per process, skipping a record whose run is in progress or that is gone; a run that cannot start fails the change. `after_commit` (no `faultMode`): before the change commits, it queues one `processes.startRunsAfterCommit` job per process and matching event, carrying the process's version; after the commit, the job locks the process and starts those runs in its own transaction, with the version it carries, unless the process was turned off, the record is gone, has a run in progress or already has this event's run (`start_key`, so a retry or a second delivery starts nothing). A job is tried three times; a last failure is logged. Jobs run in no particular order. Each job counts its hop (`tx.hop`): one queued from a job's transaction is one hop further, and none is queued past 10 hops, so processes that trigger each other stop. Either way the run keeps the event (`trigger_event`).
- The daily job (`processes.startDueRuns`, 06:00 London) starts a run for each record whose trigger date is today or up to the trigger's `maxDaysLate` days ago, if it never had a run of that process, one transaction each. It also cancels runs that can no longer run.
- An admin starts a run by hand for a record of the process's record type (`create` on `process_run` for its subject), whether the process is on or off, unless one is in progress for it. Before the subject's start date, the run counts from their start date.
- A step starts once every step in its `after` is completed or skipped; a step with an empty `after` starts with the run. Until then it waits (`step_waiting_to_start`) without a task. A definition naming an unknown step, a step itself, a step twice or a cycle is refused. A step's task goes to its assignee rule's person on the day the step starts (never before the run's start day), else its fallback, with a note when the owner covers a missing manager; with nobody, the step is skipped, and the steps waiting for it start. Due dates count from the run's start day. Due dates count calendar days, or business days by the person's own working weeks and bank holidays, refusing a year with no known bank holidays.
- A step's task (`process_step_to_do`) is marked done with the ordinary task command. Before the commit, processes completes the step from `tasks.task_status_changed`, starts the steps that waited for it, and finishes the run when every step is done or skipped. Steps start under the run's lock, so two people finishing the last two steps a step waits for start it once. It locks the run after the task, never the process; every transaction that locks both takes the task first.
- The daily job cancels a run whose subject was removed, or whose step still awaiting its task lost it with its assignee, cancelling its waiting steps too, locking the run's open tasks before the run. A task marked done meanwhile stays done. Assignees read "This process was cancelled."; the cause stays on the run for admins.
- Processes reads people, managers, the owner and working days through `PeoplePort` and `WorkingCalendarsPort` in `ports/`, which the employees module fills from its `adapters/`, and the records it runs on through their record types' registered process capabilities. It imports no module.
- Runs are read through `process_run` permissions: admins and the owner read and change every run; others read none. A task's readers see the run's progress as counts, never the other steps.

## Data model

- **`processes`:** `key`, `name`, `description`, `active_version_id` (one of its own published versions), `turned_on_at` (null while off).
- **`process_versions`:** `version`, `status` (`draft` or `published`, one draft per process), `definition_schema_version`, `definition`.
- **`process_runs`:** the version it started with, the record it is about (`record_type`, `record_id`: a record type with process capabilities, today an employee or a task) and its subject (`subject_employee_id`, no foreign key so a removal is noticed; a task's subject, which may be null), how it started, `trigger_date` or `trigger_event` and `start_key` (unique per process, so a trigger starts once), `start_day`, `status` (`in_progress`, `finished`, `cancelled`) with its columns. One run in progress per process and record.
- **`process_run_step_progress`:** a run's progress on each step of its version's definition (the steps themselves live in `process_versions.definition`): one row per step from the run's start: `status`, `task_id` (null while the step waits, set null when the task goes with its assignee), `assignee_note`, `skip_reason`, `finished_at`.
