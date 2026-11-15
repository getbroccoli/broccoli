import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { CalendarDate } from "../../../utils";
import { TASK_STATUSES } from "../domain";

/**
 * Work asked of one person. The migration adds the foreign keys to employees, which another
 * module owns: deleting the assignee or the person who asked deletes the task.
 */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    type: text("type").notNull(),
    status: text("status", { enum: TASK_STATUSES }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    assigneeEmployeeId: uuid("assignee_employee_id").notNull(),
    askedByEmployeeId: uuid("asked_by_employee_id"),
    subjectEmployeeId: uuid("subject_employee_id"),
    /** The record the task acts on, through the records registry. */
    recordType: text("record_type"),
    recordId: text("record_id"),
    dueDate: date("due_date", { mode: "string" }).$type<CalendarDate>(),
    doneAt: timestamp("done_at", { withTimezone: true }),
    doneByEmployeeId: uuid("done_by_employee_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("tasks_assignee_idx").on(table.assigneeEmployeeId),
    index("tasks_asked_by_idx").on(table.askedByEmployeeId),
    index("tasks_record_idx").on(table.recordType, table.recordId),
    check("tasks_title_not_blank", sql`btrim(${table.title}) <> ''`),
    // A manual to-do has the person who asked; a feature's task never has one, so no person deletes it.
    check(
      "tasks_asked_by_someone",
      sql`(${table.type} = 'manual_to_do') = (${table.askedByEmployeeId} is not null)`,
    ),
    check(
      "tasks_record_complete",
      sql`(${table.recordType} is null) = (${table.recordId} is null)`,
    ),
    check(
      "tasks_columns_follow_status",
      sql`(${table.status} = 'done') = (${table.doneAt} is not null)
        and (${table.doneAt} is null or ${table.cancelledAt} is null)
        and (${table.status} = 'cancelled') = (${table.cancelledAt} is not null)
        and (${table.cancelledAt} is null) = (${table.cancelReason} is null)
        and (${table.cancelReason} is null or btrim(${table.cancelReason}) <> '')`,
    ),
  ],
);
