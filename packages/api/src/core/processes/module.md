# Processes

A process gives people tasks when something happens to a record, and follows each run of it to its end. Two are ready-made: **Welcome a new starter**, which on a person's start date gives their manager "Have a welcome 1:1" and the person "Have coffee calls with 3 colleagues"; and the **Onboarding example**, whose last step, "Check that your accounts work", waits until the owner has provisioned the person's accounts, then asks the person whether everything works; on No the owner gets "Fix their accounts", and either way the manager then gets "Take them to lunch". Three more are built in (`built_in`) and on in every fresh workspace: **Tell the assignee about a new task** and **Tell the asker a task is done** (`notifications.task_created`, `notifications.task_done`), each a single `notifications.notify` action step, and **Manager approval** and **Owner approval** (`manager_approval`, `owner_approval`), which approvals runs when a feature asks for approval; a reset turns built-in processes back on and every other one off.

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
     "payload": {
       "taskId": "t1",
       "from": "to_do",
       "to": "done",
       "byEmployeeId": "owner",
       "result": null
     }
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

### A step that asks for a result

A step's task may carry a result form, which its task copies; `ensure_provision` asks Yes or No, No with a comment:

```json
"resultForm": { "kind": "choice", "display": "buttons", "options": [
  { "code": "yes", "label": "Yes" }, { "code": "no", "label": "No", "commentRequired": true } ] }
```

Ada answers with the ordinary mark done (`result: { "code": "no", "comment": "VPN login fails" }`); the status event carries the result, and the step keeps its own copy, which stays when her task goes with her:

```json
{
  "run_id": "run3",
  "step_key": "ensure_provision",
  "status": "step_completed",
  "result_code": "no",
  "result_comment": "VPN login fails"
}
```

### Steps that branch on a result

An `after` entry may name a result of its step; `join` `any` lets a step start once one entry is met, so the branches meet again:

```json
{ "key": "fix_accounts", "after": [{ "step": "ensure_provision", "when": { "result": "no" } }], "task": { … } }
{ "key": "welcome_lunch", "join": "any",
  "after": ["fix_accounts", { "step": "ensure_provision", "when": { "result": "yes" } }], "task": { … } }
```

Ada answers Yes, and in the same transaction the No branch is never reached and the lunch starts:

```json
// process_run_step_progress
{ "run_id": "run3", "step_key": "ensure_provision", "status": "step_completed", "result_code": "yes" }
{ "run_id": "run3", "step_key": "fix_accounts", "status": "step_not_reached", "task_id": null }
{ "run_id": "run3", "step_key": "welcome_lunch", "status": "step_awaiting_task_completion", "task_id": "t8" }
```

### A step that runs an action

Every step has `key`, `after` and `join`; its kind adds its own settings under its name. Besides `task`, a step may be an `action`: Broccoli does something itself, by naming an action a module registered and its params:

```json
{ "key": "tell_owner", "kind": "action", "after": ["provision_accounts"],
  "action": { "name": "notifications.notify", "params": { … } } }
```

When it is ready, the step completes, without a task, in the transaction that made it ready, and its action runs there after the steps are saved:

```json
{ "run_id": "run4", "step_key": "tell_owner", "status": "step_completed", "task_id": null }
```

## Rules

- A process is off until an admin turns it on (`MANAGE_WORKSPACE`); turning it on or off appends a history line for record type `process`, which only those who manage the workspace read. Turning it on starts today's due runs at once, and never anyone whose date was before that day.
- What a process does lives in its published version's definition (JSON, read by `parseProcessDefinition` for the `definition_schema_version` it was written in). A published version never changes; a new release ships a new version. The trigger fires on a record's date plus an offset (`on_record_date`, a date field its record type registered, such as an employee's `startDate`), or on a domain event (`on_event`); schedule triggers are refused. A definition naming a record type, date field or event nobody registered is refused.
- An `on_event` trigger names an event its publishing module registered as triggering (`employees.added`, and `tasks.task_created` and `tasks.task_status_changed`, which processes registers for tasks), with an optional `when` on one payload field (its value `in` a list, or `notIn` one; a missing field is null), and a `run` mode. `in_same_transaction` (with `faultMode` `rollback_transaction`): before the change commits, `startRunsOnEvents` starts one run per event and record the event is about, batched per process, skipping a record whose run is in progress or that is gone; a run that cannot start fails the change. `after_commit` (no `faultMode`): before the change commits, it queues one `processes.startRunsAfterCommit` job per process and matching event, carrying the process's version; after the commit, the job locks the process and starts those runs in its own transaction, with the version it carries, unless the process was turned off, the record is gone, has a run in progress or already has this event's run (`start_key`, so a retry or a second delivery starts nothing). A job is tried three times; a last failure is logged. Jobs run in no particular order. Each job counts its hop (`tx.hop`): one queued from a job's transaction is one hop further, and none is queued past 10 hops, so processes that trigger each other stop. Either way the run keeps the event (`trigger_event`).
- The daily job (`processes.startDueRuns`, 06:00 London) starts a run for each record whose trigger date is today or up to the trigger's `maxDaysLate` days ago, if it never had a run of that process, one transaction each. It also cancels runs that can no longer run.
- An admin starts a run by hand for a record of the process's record type (`create` on `process_run` for its subject), whether the process is on or off, unless one is in progress for it. Before the subject's start date, the run counts from their start date.
- A step waits (`step_waiting_to_start`) without a task until its `after` lets it start; with an empty `after` it starts with the run. An entry naming a step alone is met once that step is completed or skipped; one with `when` only once it is completed with that result code. With `join` `all` (the default) the step starts once every entry is met; with `any`, once one is. A step whose entries can no longer be met (another result, a skipped step that gave none, a step itself not reached) is not reached (`step_not_reached`): it never gets a task, and the steps after it may be not reached in turn. A run branches on the codes of its own version. A definition naming an unknown step, a step itself, a step twice, a cycle, or a result its step does not offer is refused. A step's task goes to its assignee rule's person on the day the step starts (never before the run's start day), else its fallback, with a note when the owner covers a missing manager; with nobody, the step is skipped, and the steps waiting for it start. Due dates count from the run's start day. Due dates count calendar days, or business days by the person's own working weeks and bank holidays, refusing a year with no known bank holidays.
- A module registers an action with `ProcessActionRegistration`: a zod schema for its params and `run(ctx, tx, { run, step, params })`, and declares its name and params by merging into `ProcessActions`; `modules/index.ts` collects the registrations. A definition naming an unregistered action, params its schema refuses, a `when` on an action step (actions give no result), or a step kind not built yet (`wait`, `subprocess`, `agent`, `end`) is refused. A ready action step completes at once, and its action runs as Broccoli in that transaction once the steps are saved: at a run's start, or in the mark done that made it ready. So an action writes in `tx` and queues jobs only, never another transaction or outside I/O, and needs a lock-order review if it locks records it did not create, since the run's lock is held. If it throws, the whole transaction rolls back: the mark done or in-same-transaction run fails, and an after-commit job retries with every run it starts. An action with nothing to do returns; the step completes. A step not reached runs no action. Run id plus step key is an action's key for idempotency.
- A step's task (`process_step_to_do`) is marked done with the ordinary task command. Before the commit, processes completes the step from `tasks.task_status_changed`, starts the steps that waited for it or marks them not reached, and finishes the run when every step is completed, skipped or not reached. Steps start under the run's lock, so two people finishing the last two steps a step waits for start it once. It locks the run after the task, never the process; every transaction that locks both takes the task first.
- The daily job cancels a run whose subject was removed, or whose step still awaiting its task lost it with its assignee, cancelling its waiting steps too, locking the run's open tasks before the run. A task marked done meanwhile stays done. Assignees read "This process was cancelled."; the cause stays on the run for admins.
- Processes reads people, managers, the owner and working days through `PeoplePort` and `WorkingCalendarsPort` in `ports/`, which the employees module fills from its `adapters/`, and the records it runs on through their record types' registered process capabilities. It imports no module.
- Runs are read through `process_run` permissions: admins and the owner read and change every run; others read none. A task's readers see its run's progress as counts, never the other steps, and the run's outcome only on the outcome step's own task.
- A definition may name an outcome step (`"outcome": { "step": "decide", "labels": { "rejected": "Rejected" } }`), a task step asking for a result; its result is the run's outcome, read as its label. When a run finishes or is cancelled, processes publishes `processes.run_ended` before the commit, with the outcome and who gave it.
- A task step may name who asked for its task from the trigger event (`"askedBy": { "kind": "event_employee", "field": "requesterEmployeeId" }`), and its title and description may name the event's fields (`{event.title}`). A process whose subject is `from_event` runs on the record each event names, for an event whose registration reads the record type from its payload, such as `approvals.approval_requested`; it starts only from its event.

## Data model

- **`processes`:** `key`, `name`, `description`, `active_version_id` (one of its own published versions), `turned_on_at` (null while off).
- **`process_versions`:** `version`, `status` (`draft` or `published`, one draft per process), `definition_schema_version`, `definition`.
- **`process_runs`:** the version it started with, the record it is about (`record_type`, `record_id`: a record type with process capabilities, today an employee or a task) and its subject (`subject_employee_id`, no foreign key so a removal is noticed; a task's subject, which may be null), how it started, `trigger_date` or `trigger_event` and `start_key` (unique per process, so a trigger starts once), `start_day`, `status` (`in_progress`, `finished`, `cancelled`) with its columns. One run in progress per process and record.
- **`process_run_step_progress`:** a run's progress on each step of its version's definition (the steps themselves live in `process_versions.definition`): one row per step from the run's start: `status`, `task_id` (null while the step waits, set null when the task goes with its assignee), `assignee_note`, `skip_reason`, `finished_at`, `result_code` and `result_comment` (the task's result, once completed).
