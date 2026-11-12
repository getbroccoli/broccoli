import type { Orm } from "../../src/core/db";
import { processRepository } from "../../src/modules/processes/db";
import type { ProcessDefinition } from "../../src/modules/processes/domain";
import { testTransactor } from "./testTransactor";

/** A process with its first published version active, without invoking use cases or events. */
export function seedProcess(
  orm: Orm,
  {
    key,
    definition,
    turnedOn = true,
  }: {
    key: string;
    definition: ProcessDefinition;
    turnedOn?: boolean;
  },
): Promise<{ id: string; key: string }> {
  return testTransactor(orm)((tx) =>
    processRepository(tx).insertProcess({
      key,
      name: key,
      description: "Test process",
      definition,
      turnedOnAt: turnedOn ? new Date() : null,
    }),
  );
}

/** A process on `event`, with one task step for its subject, due the day it starts. */
export function eventProcess(
  event: "employees.added" | "tasks.task_created" | "tasks.task_status_changed",
  when?: { field: string; in: (string | null)[] },
): ProcessDefinition {
  return {
    subject: { recordType: event === "employees.added" ? "employee" : "task" },
    trigger: {
      kind: "on_event",
      event,
      run: "in_same_transaction",
      faultMode: "rollback_transaction",
      ...(when && { when }),
    },
    startableByAdmin: false,
    steps: [
      {
        key: "follow_up",
        kind: "task",
        title: "Follow up",
        description: null,
        assignee: { kind: "subject" },
        due: { amount: 0, unit: "calendar_days" },
      },
    ],
  };
}
