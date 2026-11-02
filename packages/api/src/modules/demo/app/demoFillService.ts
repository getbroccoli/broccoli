import { readFile } from "node:fs/promises";

import type { Tx } from "../../../core/db";
import { PrincipalSecurityContext } from "../../../core/security";
import { type CalendarDate, parseRasterImage, type RasterImage, todayInUtc } from "../../../utils";
import { createEmployeeSetupService } from "../../employees";
import { demoPeople } from "../domain";

const employeeSetup = createEmployeeSetupService();

/** Writes the demo company inside the caller's transaction. */
export type DemoFill = (tx: Tx) => Promise<void>;

/** The demo company's people, prepared for a demo start. */
export interface DemoFillService {
  /**
   * Reads the demo company's avatars, so no file I/O runs while a transaction holds locks, and
   * returns its fill: the demo company for an instance without employees, otherwise nothing.
   */
  prepareDemoFill: (today?: CalendarDate) => Promise<DemoFill>;
}

export function createDemoFillService(): DemoFillService {
  return {
    async prepareDemoFill(today = todayInUtc()) {
      const people = demoPeople(today);
      const avatars = await readAvatars(people.map(({ key }) => key));
      // Broccoli fills the sample company; the caller's own access was checked before.
      const ctx = PrincipalSecurityContext.system();
      return (tx) =>
        employeeSetup.createDemoEmployees(
          ctx,
          tx,
          people.map(({ employee, managerEmail }, index) => ({
            employee,
            avatar: avatars[index]!,
            managerEmail,
          })),
          { kind: "ADDED_WITH_DEMO" },
        );
    },
  };
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
