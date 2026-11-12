# Processes

A process gives people tasks when something happens to a record, and follows each run of it to its end. The first one is ready-made: **Welcome a new starter**, which on a person's start date gives their manager "Have a welcome 1:1" and the person "Have coffee calls with 3 colleagues".

## Rules

- A process is off until an admin turns it on (`MANAGE_WORKSPACE`); turning it on or off appends a history line for record type `process`, which only those who manage the workspace read. Turning it on starts today's due runs at once, and never anyone whose date was before that day.
- What a process does lives in its published version's definition (JSON, read by `parseProcessDefinition` for the `definition_schema_version` it was written in). A published version never changes; a new release ships a new version. The trigger fires on a record's date plus an offset (`on_record_date`, employees only), or on a domain event (`on_event`); schedule triggers are refused.
- An `on_event` trigger names an event listed in `TRIGGERING_EVENTS` (`employees.added`, `tasks.task_created`, `tasks.task_status_changed`), with an optional `when` on one payload field, and runs `in_same_transaction` with `faultMode` `rollback_transaction`: before the change commits, `startRunsOnEvents` starts one run per event and record the event is about, batched per process, skipping a record whose run is in progress or that is gone. The run keeps the event (`trigger_event`); a run that cannot start fails the change.
- The daily job (`processes.startDueRuns`, 06:00 London) starts a run for each record whose trigger date is today or up to the trigger's `maxDaysLate` days ago, if it never had a run of that process, one transaction each. It also cancels runs that can no longer run.
- An admin starts a run by hand (`create` on `process_run` for the person), whether the process is on or off, unless one is in progress for them. Before the person's start date, the run counts from their start date.
- Steps run in parallel. Each step's task goes to its assignee rule's person on the run's start day, else its fallback, with a note when the owner covers a missing manager; with nobody, the step is skipped. Due dates count calendar days, or business days by the person's own working weeks and bank holidays, refusing a year with no known bank holidays.
- A step's task (`process_step_to_do`) is finished and reopened through `markStepDone` and `reopenStep`, which change the task and the run in one transaction: the run finishes when every step is done or skipped, and a reopened step takes it back in progress, unless the run was cancelled or a newer one is in progress.
- A run cancels itself the next time it runs when its subject was removed, or when a step still waiting lost its task with its assignee; the cancellation commits and is returned. Assignees read "This process was cancelled."; the cause stays on the run for admins.
- Runs are read through `process_run` permissions: admins and the owner read and change every run; others read none. A task's readers see the run's progress as counts, never the other steps.

## Data model

- **`processes`:** `key`, `name`, `description`, `active_version_id` (one of its own published versions), `turned_on_at` (null while off).
- **`process_versions`:** `version`, `status` (`draft` or `published`, one draft per process), `definition_schema_version`, `definition`.
- **`process_runs`:** the version it started with, the record it is about (`record_type`, `record_id`: an employee or a task) and its subject (`subject_employee_id`, no foreign key so a removal is noticed; a task's subject, which may be null), how it started, `trigger_date` or `trigger_event` and `start_key` (unique per process, so a trigger starts once), `start_day`, `status` (`in_progress`, `finished`, `cancelled`) with its columns. One run in progress per process and record.
- **`process_run_steps`:** one row per step: `status`, `task_id` (set null when the task goes with its assignee), `assignee_note`, `skip_reason`, `finished_at`.
