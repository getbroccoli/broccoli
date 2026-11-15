# Notifications

Notifications tell an employee about a record without them opening Broccoli. Processes decide who is told about what: a step of kind `action` runs `notifications.notify`, so no feature sends its own notices. Email is the only channel, with no settings.

## Rules

- `notifications.notify` takes a `recipient` (`{ "kind": "record_employee", "field": "assignee" }`: an employee field the run's record type lists in `employeeFields`, read with `readEmployees` in the run's transaction) and an `emailTemplateKey` a module registered. A definition naming an unlisted field or an unregistered template is refused.
- Nobody is told about their own change: a recipient equal to the triggering event's `byEmployeeId` gets nothing; a null `byEmployeeId` (Broccoli itself) is someone else. A record with nobody in the field tells nobody. Either way the step completes.
- Otherwise the action queues a `notifications.send` job in the run's transaction, keyed by the run id and step key, which is the email's idempotency key.
- The job emails the employee's work email if they still exist and joined (have a user). The template's `readValues` reads the record as it is then and returns null when it is gone or the recipient may no longer see it, which drops the email. No mail choice drops it too; nothing is held for later. A refusal that may pass later is retried by the job; one that won't is dropped. Every outcome is logged with ids only.
- A module registers its templates in `modules/index.ts`: `{ template, readValues(recordId, recipientEmployeeId) }`, the template an `EmailTemplate` of the shared blocks, given `recipientEmail`, `linkOrigin` and `companyName` besides its own values. The sender name is the person `readValues` names, else the company, as for invites. Tasks registers `tasks.task_assigned` and `tasks.task_done`.
