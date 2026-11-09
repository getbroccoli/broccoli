import { readFile } from "node:fs/promises";

import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { type CalendarDate, parseRasterImage, type RasterImage, todayInUtc } from "../../../utils";
import { createEmployeeSetupService } from "../../employees";
import type { TaskService } from "../../tasks";
import type { TimeOffService } from "../../timeOff";
import { type DemoTask, demoPeople, demoTasks } from "../domain";

const employeeSetup = createEmployeeSetupService();

/** Writes the demo company inside the caller's transaction. */
export type DemoFill = (tx: Tx) => Promise<void>;

/** The demo company's people, with time off on, prepared for a demo start. */
export interface DemoFillService {
  /**
   * Reads the demo company's avatars, so no file I/O runs while a transaction holds locks, and
   * returns its fill: for an instance without employees, the demo company, with time off turned on
   * as an owner would: everyone on "England and Wales" terms, Monday to Friday and the UK statutory
   * minimum, and a few tasks the people asked of each other; otherwise nothing.
   */
  prepareDemoFill: (today?: CalendarDate) => Promise<DemoFill>;
}

export function createDemoFillService({
  timeOff,
  tasks,
}: {
  timeOff: Pick<TimeOffService, "turnOnTimeOff">;
  tasks: Pick<TaskService, "createTask" | "markWaiting">;
}): DemoFillService {
  async function turnOnDemoTimeOff(ctx: SecurityContext, tx: Tx) {
    await timeOff.turnOnTimeOff(ctx, tx, {
      terms: [
        {
          bankHolidayCalendar: "england_and_wales",
          workingWeek: "monday_to_friday_7_5_hours",
          annualLeavePolicyKey: "uk_statutory_minimum",
        },
      ],
      locationTerms: [],
    });
  }
  return {
    async prepareDemoFill(today = todayInUtc()) {
      const people = demoPeople(today);
      const avatars = await readAvatars(people.map(({ key }) => key));
      // Broccoli fills the sample company; the caller's own access was checked before.
      const ctx = PrincipalSecurityContext.system();
      return async (tx) => {
        const idsByEmail = await employeeSetup.createDemoEmployees(
          ctx,
          tx,
          people.map(({ employee, managerEmail, locationName, isOwner }, index) => ({
            employee,
            avatar: avatars[index]!,
            managerEmail,
            locationName,
            isOwner,
          })),
          { kind: "ADDED_WITH_DEMO" },
        );
        if (idsByEmail) {
          await turnOnDemoTimeOff(ctx, tx);
          await addDemoTasks(ctx, tx, tasks, demoTasks(today), idsByEmail);
        }
      };
    },
  };
}

async function addDemoTasks(
  ctx: SecurityContext,
  tx: Tx,
  tasks: Pick<TaskService, "createTask" | "markWaiting">,
  demo: readonly DemoTask[],
  idsByEmail: ReadonlyMap<string, string>,
) {
  for (const { assigneeEmail, requestedByEmail, isWaiting, ...task } of demo) {
    const created = await tasks.createTask(ctx, tx, {
      ...task,
      type: "manual_to_do",
      assigneeEmployeeId: idsByEmail.get(assigneeEmail)!,
      requestedByEmployeeId: idsByEmail.get(requestedByEmail)!,
    });
    if (isWaiting) {
      await tasks.markWaiting(ctx, tx, created.id);
    }
  }
}

/** The shipped avatars are 256 px WebP files of about 10 KB. */
const AVATAR_MAX_BYTES = 64 * 1024;

/** The avatar of each person, by key, read from the files shipped next to the code. */
async function readAvatars(keys: readonly string[]): Promise<RasterImage[]> {
  return Promise.all(
    keys.map(async (key) => {
      const bytes = await readFile(new URL(`../avatars/${key}.webp`, import.meta.url));
      const avatar = parseRasterImage(bytes, { maxBytes: AVATAR_MAX_BYTES });
      if (!avatar) {
        throw new Error(`The demo avatar ${key}.webp is not a valid image`);
      }
      return avatar;
    }),
  );
}
