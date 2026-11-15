import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { processRepository } from "../../src/core/processes/db";
// eslint-disable-next-line boundaries/dependencies -- Test-only version seeding has no repository operation.
import { processes, processVersions } from "../../src/core/processes/db/processesTable";
import {
  PROCESS_DEFINITION_SCHEMA_VERSION,
  type StoredProcessDefinition,
} from "../../src/core/processes/domain";
import { testTransactor } from "./testTransactor";

/** A stored definition whose steps are all task steps, so a test can change their task. */
export type TaskStepsDefinition = StoredProcessDefinition & {
  steps: Extract<StoredProcessDefinition["steps"][number], { kind: "task" }>[];
};

/** A process with its first published version active, without invoking use cases or events. */
export function seedProcess(
  orm: Orm,
  {
    key,
    definition,
    turnedOn = true,
  }: {
    key: string;
    definition: StoredProcessDefinition;
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
): TaskStepsDefinition {
  return {
    subject: { recordType: event === "employees.added" ? "employee" : "task" },
    trigger: {
      kind: "on_event",
      event,
      run: "in_same_transaction",
      faultMode: "rollback_transaction",
      ...(when && { when }),
    },
    steps: [
      {
        key: "follow_up",
        kind: "task",
        task: {
          title: "Follow up",
          description: null,
          assignee: { kind: "subject" },
          due: { amount: 0, unit: "calendar_days" },
          resultForm: null,
        },
      },
    ],
  };
}

/** An event process whose run starts from a job after the triggering change commits. */
export function afterCommitProcess(
  event: "employees.added" | "tasks.task_created" | "tasks.task_status_changed",
  when?: { field: string; in: (string | null)[] },
): TaskStepsDefinition {
  return {
    ...eventProcess(event),
    trigger: { kind: "on_event", event, run: "after_commit", ...(when && { when }) },
  };
}

/** Publishes and activates a second version without changing the first version. */
export function seedSecondProcessVersion(
  orm: Orm,
  { processId, definition }: { processId: string; definition: StoredProcessDefinition },
) {
  return orm.transaction(async (tx) => {
    const [version] = await tx
      .insert(processVersions)
      .values({
        processId,
        version: 2,
        status: "published",
        definitionSchemaVersion: PROCESS_DEFINITION_SCHEMA_VERSION,
        definition,
      })
      .returning({ id: processVersions.id });
    await tx
      .update(processes)
      .set({ activeVersionId: version!.id })
      .where(eq(processes.id, processId));
    return version!;
  });
}
