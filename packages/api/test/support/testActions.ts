import { assert } from "vitest";
import { z } from "zod";

import type { Orm } from "../../src/core/db";
import type { StoredProcessDefinition } from "../../src/core/processes/domain";
import type {
  ProcessActionRegistration,
  ProcessActionRegistrations,
} from "../../src/core/processes";
import { taskService } from "./services";

/** Actions registered only by process tests. */
declare module "../../src/core/processes" {
  interface ProcessActions {
    "test.record_call": { note: string };
    "test.fail": Record<string, never>;
    "test.fail_once": { note: string };
  }
}

export function testActions(orm: Orm): {
  actions: ProcessActionRegistrations;
  calls: { runId: string; stepKey: string; note: string }[];
} {
  const calls: { runId: string; stepKey: string; note: string }[] = [];
  const tasks = taskService(orm);
  const recordCall: ProcessActionRegistration<{ note: string }> = {
    params: z.object({ note: z.string() }),
    run: async (ctx, tx, { run, step, params }) => {
      assert(run.subjectEmployeeId);
      calls.push({ runId: run.id, stepKey: step.key, note: params.note });
      await tasks.createTask(ctx, tx, {
        type: TEST_ACTION_TO_DO,
        title: params.note,
        assigneeEmployeeId: run.subjectEmployeeId,
        subjectEmployeeId: run.subjectEmployeeId,
        record: { recordType: run.recordType, recordId: run.recordId },
        cause: { kind: "PROCESS_RUN", ref: run.id },
      });
    },
  };
  let failed = false;
  return {
    actions: {
      "test.record_call": recordCall,
      "test.fail": {
        params: z.object({}),
        run: () => {
          throw new Error("Action failed");
        },
      },
      "test.fail_once": {
        params: recordCall.params,
        run: (ctx, tx, context) => {
          if (!failed) {
            failed = true;
            throw new Error("Action failed");
          }
          return recordCall.run(ctx, tx, context);
        },
      },
    },
    calls,
  };
}

/** A process on a person's start date: a task, an action after it, then a task after the action. */
export function actionProcess(): StoredProcessDefinition {
  return {
    subject: { recordType: "employee" },
    trigger: {
      kind: "on_record_date",
      recordType: "employee",
      dateField: "startDate",
      offset: { amount: 0, unit: "calendar_days" },
      maxDaysLate: 7,
    },
    steps: [
      {
        key: "prepare",
        kind: "task",
        task: {
          assignee: { kind: "subject" },
          title: "Prepare accounts",
          due: { amount: 0, unit: "calendar_days" },
        },
      },
      {
        key: "tell_owner",
        kind: "action",
        after: ["prepare"],
        action: { name: "test.record_call", params: { note: "prepared" } },
      },
      {
        key: "check",
        kind: "task",
        after: ["tell_owner"],
        task: {
          assignee: { kind: "subject" },
          title: "Check accounts",
          due: { amount: 0, unit: "calendar_days" },
        },
      },
    ],
  };
}

/** The to-do the test action leaves: a feature's own type, so it has no asker. */
const TEST_ACTION_TO_DO = "test_action_to_do";
