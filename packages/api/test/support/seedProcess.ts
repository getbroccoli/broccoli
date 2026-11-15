import { eq } from "drizzle-orm";

import type { Orm } from "../../src/core/db";
import { processRepository } from "../../src/core/processes/db";
// eslint-disable-next-line boundaries/dependencies -- Test-only version seeding has no repository operation.
import { processes, processVersions } from "../../src/core/processes/db/processesTable";
import {
  PROCESS_DEFINITION_SCHEMA_VERSION,
  type ProcessDefinition,
} from "../../src/core/processes/domain";
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
    steps: [
      {
        key: "follow_up",
        kind: "task",
        task: {
          title: "Follow up",
          description: null,
          assignee: { kind: "subject" },
          due: { amount: 0, unit: "calendar_days" },
        },
      },
    ],
  };
}

/** An event process whose run starts from a job after the triggering change commits. */
export function afterCommitProcess(
  event: "employees.added" | "tasks.task_created" | "tasks.task_status_changed",
  when?: { field: string; in: (string | null)[] },
): ProcessDefinition {
  return {
    ...eventProcess(event),
    trigger: { kind: "on_event", event, run: "after_commit", ...(when && { when }) },
  };
}

/** Publishes and activates a second version without changing the first version. */
export function seedSecondProcessVersion(
  orm: Orm,
  { processId, definition }: { processId: string; definition: ProcessDefinition },
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
