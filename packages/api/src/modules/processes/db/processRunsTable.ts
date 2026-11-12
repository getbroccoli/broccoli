import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { jsonb } from "../../../core/db";
import type { CalendarDate } from "../../../utils";
import {
  ASSIGNEE_NOTES,
  CANCEL_CAUSES,
  RUN_STATUSES,
  SKIP_REASONS,
  START_CAUSES,
  STEP_STATUSES,
  type TriggerEvent,
} from "../domain";
import { processes, processVersions } from "./processesTable";

/**
 * One run of a process version for one record. The migration adds the foreign keys to employees,
 * which another module owns: a removed person leaves the run, without them.
 */
export const processRuns = pgTable(
  "process_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    processId: uuid("process_id").notNull(),
    processVersionId: uuid("process_version_id").notNull(),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    /** No foreign key: a run must still see that its subject was removed. */
    subjectEmployeeId: uuid("subject_employee_id"),
    startCause: text("start_cause", { enum: START_CAUSES }).notNull(),
    startedByEmployeeId: uuid("started_by_employee_id"),
    triggerDate: date("trigger_date", { mode: "string" }).$type<CalendarDate>(),
    startKey: text("start_key"),
    triggerEvent: jsonb("trigger_event").$type<TriggerEvent>(),
    startDay: date("start_day", { mode: "string" }).$type<CalendarDate>().notNull(),
    status: text("status", { enum: RUN_STATUSES }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByEmployeeId: uuid("cancelled_by_employee_id"),
    cancelCause: text("cancel_cause", { enum: CANCEL_CAUSES }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "process_runs_process_fk",
      columns: [table.processId],
      foreignColumns: [processes.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "process_runs_version_fk",
      columns: [table.processId, table.processVersionId],
      foreignColumns: [processVersions.processId, processVersions.id],
    }),
    uniqueIndex("process_runs_start_key_unique")
      .on(table.processId, table.startKey)
      .where(sql`${table.startKey} is not null`),
    uniqueIndex("process_runs_one_in_progress_per_record")
      .on(table.processId, table.recordType, table.recordId)
      .where(sql`${table.status} = 'in_progress'`),
    index("process_runs_process_status_idx").on(table.processId, table.status),
    // Whether a record ever had a run of the process, which the daily job asks for each due record.
    index("process_runs_record_idx").on(table.processId, table.recordType, table.recordId),
    index("process_runs_subject_idx").on(table.subjectEmployeeId),
    check(
      "process_runs_status_known",
      sql`${table.status} in ('in_progress', 'finished', 'cancelled')`,
    ),
    check(
      "process_runs_start_cause_known",
      sql`${table.startCause} in ('started_on_record_date', 'started_by_admin', 'started_on_event')`,
    ),
    check(
      "process_runs_trigger_event_follows_start_cause",
      sql`(${table.startCause} = 'started_on_event') = (${table.triggerEvent} is not null)`,
    ),
    check(
      "process_runs_cancel_cause_known",
      sql`${table.cancelCause} in ('cancelled_by_admin', 'cancelled_because_step_assignee_was_removed', 'cancelled_because_subject_was_removed')`,
    ),
    check(
      "process_runs_columns_follow_status",
      sql`(${table.status} = 'finished') = (${table.finishedAt} is not null)
        and (${table.status} = 'cancelled') = (${table.cancelledAt} is not null)
        and (${table.cancelledAt} is null) = (${table.cancelCause} is null)
        and (${table.cancelledAt} is null) = (${table.cancelReason} is null)
        and (${table.cancelReason} is null or btrim(${table.cancelReason}) <> '')`,
    ),
  ],
);

/** Where each step of a run stands; created with the run, one per step of its version. */
export const processRunSteps = pgTable(
  "process_run_steps",
  {
    runId: uuid("run_id").notNull(),
    stepKey: text("step_key").notNull(),
    status: text("status", { enum: STEP_STATUSES }).notNull(),
    /** The migration adds its foreign key to tasks: a removed assignee's task goes, the step stays. */
    taskId: uuid("task_id").unique(),
    assigneeNote: text("assignee_note", { enum: ASSIGNEE_NOTES }),
    skipReason: text("skip_reason", { enum: SKIP_REASONS }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.stepKey] }),
    foreignKey({
      name: "process_run_steps_run_fk",
      columns: [table.runId],
      foreignColumns: [processRuns.id],
    }).onDelete("cascade"),
    check("process_run_steps_key_not_blank", sql`btrim(${table.stepKey}) <> ''`),
    check(
      "process_run_steps_status_known",
      sql`${table.status} in ('step_awaiting_task_completion', 'step_completed', 'step_skipped', 'step_cancelled')`,
    ),
    check(
      "process_run_steps_assignee_note_known",
      sql`${table.assigneeNote} in ('assignee_is_owner_because_subject_has_no_manager')`,
    ),
    check(
      "process_run_steps_columns_follow_status",
      sql`(${table.status} = 'step_awaiting_task_completion') = (${table.finishedAt} is null)
        and (${table.status} = 'step_skipped') = (${table.skipReason} is not null)
        and (${table.skipReason} is null or ${table.skipReason} = 'no_assignee_for_step')`,
    ),
  ],
);
