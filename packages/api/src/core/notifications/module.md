# Notifications

Notifications tell an employee about a record without them opening Broccoli. Processes decide who is told about what: a step of kind `action` runs `notifications.notify`, so no feature sends its own notices. Email is the only channel, with no settings.

## Example

1. Sam asks Mia to book the team offsite. The task's creation publishes `tasks.task_created` with `{ "taskId": "t1", "assigneeEmployeeId": "mia", "askedByEmployeeId": "sam", "byEmployeeId": "sam" }`, and the built-in `notifications.task_created` (on, `after_commit`) queues its start.
2. Its run on task `t1` reaches the one step:

   ```json
   {
     "key": "notify_assignee",
     "kind": "action",
     "action": {
       "name": "notifications.notify",
       "params": {
         "recipient": { "kind": "record_employee", "field": "assignee" },
         "emailTemplateKey": "tasks.task_assigned"
       }
     }
   }
   ```

3. The task's `assignee` is Mia, not Sam who made the change, so the action queues, in the run's transaction:

   ```json
   {
     "name": "notifications.send",
     "payload": {
       "recipient": { "employeeId": "mia" },
       "emailTemplateKey": "tasks.task_assigned",
       "record": { "recordType": "task", "recordId": "t1" },
       "key": "run1:notify_assignee"
     }
   }
   ```

4. The job reads Mia (joined, `mia@example.com`) and the task as it is now, and sends "Sam Lee asked you: Book the team offsite" from "Sam Lee via Acme Corp", linking `<origin>/tasks/t1`, with `run1:notify_assignee` as the idempotency key. Nothing is stored besides the job.

## Rules

- `notifications.notify` takes a `recipient` (`{ "kind": "record_employee", "field": "assignee" }`: an employee field the run's record type lists in `employeeFields`, read with `readEmployees` in the run's transaction) and an `emailTemplateKey` a module registered. A definition naming an unlisted field or an unregistered template is refused.
- Nobody is told about their own change: a recipient equal to the triggering event's `byEmployeeId` gets nothing; a null `byEmployeeId` (Broccoli itself) is someone else. A record with nobody in the field tells nobody. Either way the step completes.
- Otherwise the action queues a `notifications.send` job in the run's transaction, keyed by the run id and step key, which is the email's idempotency key.
- The job emails the employee's work email if they still exist and joined (have a user). The template's `readValues` reads the record as it is then and returns null when it is gone or the recipient may no longer see it, which drops the email. No mail choice drops it too; nothing is held for later. A refusal that may pass later is retried by the job; one that won't is dropped. Every outcome is logged with ids only.
- A module registers its templates in `modules/index.ts`: `{ template, readValues(recordId, recipientEmployeeId) }`, the template an `EmailTemplate` of the shared blocks, given `recipientEmail`, `linkOrigin` and `companyName` besides its own values. The sender name is the person `readValues` names, else the company, as for invites. Tasks registers `tasks.task_assigned` and `tasks.task_done`.
