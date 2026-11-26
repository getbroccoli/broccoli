# Approvals

Approvals let a feature ask for approval of one of its records and hear how it ended. The feature names an approval process; processes runs it, giving the approver a task with Approve and Reject, and approvals tells the feature the outcome in the transaction that decided it. Approvals owns no tables and no workflow of its own.

## Example

1. Sam asks for leave. In the transaction that saves the request, the time off feature asks for approval of it; its record type must have registered process capabilities (who it is about):

   ```ts
   await approvals.requestApproval(ctx, tx, {
     approvalProcessKey: "manager_approval",
     record: { recordType: "time_off_request", recordId: "r1" },
     requesterEmployeeId: "sam",
     title: "Approve Sam's leave, 2–4 Dec",
     description: "Annual leave, 2.5 days.",
   });
   ```

   It publishes `approvals.approval_requested` with the same values, its record flattened into `recordType` and `recordId`.

2. Before the commit, the built-in Manager approval starts one run on the request. Mia, the manager of Sam, whom the request is about, gets the task, asked by Sam:

   ```json
   // process_runs
   { "id": "run1", "record_type": "time_off_request", "record_id": "r1", "subject_employee_id": "sam", "status": "in_progress" }
   // tasks
   { "id": "t1", "type": "process_step_to_do", "title": "Approve Sam's leave, 2–4 Dec",
     "assignee_employee_id": "mia", "asked_by_employee_id": "sam",
     "result_form": { "kind": "choice", "display": "buttons", "options": [
       { "code": "approved", "label": "Approve" },
       { "code": "rejected", "label": "Reject", "commentRequired": true } ] } }
   ```

   If no run started (Manager approval is off, or the request already has one in progress), the change fails with "The approval could not start: its process is off or this record already has an approval in progress."

3. Mia rejects with "Clashes with the release week." The step and the run finish, processes publishes `processes.run_ended`, and before the commit approvals publishes:

   ```json
   {
     "type": "approvals.approval_finished",
     "payload": {
       "approvalProcessKey": "manager_approval",
       "recordType": "time_off_request",
       "recordId": "r1",
       "runId": "run1",
       "outcome": {
         "code": "rejected",
         "comment": "Clashes with the release week.",
         "byEmployeeId": "mia"
       },
       "endedWithoutOutcome": null
     }
   }
   ```

   The feature handles it before the commit, so its record and the decision commit together; its failure rolls the decision back. Sam sees the outcome on the task, and gets the done email with the result.

## Rules

- A feature names an approval process by key; only the processes approvals seeds are approval processes (`manager_approval` today). An unknown key is refused when asked.
- Every request ends with exactly one `approvals.approval_finished`: with an outcome, or `endedWithoutOutcome` `no_approver` (its decision step had nobody: no manager and no owner employee) or `run_cancelled` (the daily check cancelled it, such as when the approver was removed).
- A request starts its run in the requesting transaction. Approvals checks it in the next before-commit round, where processes' `processes.runs_started_on_event` arrives, whatever order the handlers run in.
- Only the assignee decides; asking gives the requester no right to finish or delete the task.
