import type { Tx } from "../../../../core/db";
import { PrincipalSecurityContext } from "../../../../core/security";
import { type CalendarDate, todayInUtc } from "../../../../utils";
import { createDemoEmployees } from "../../../employees";
import { demoPeople } from "../../domain";
import { readAvatars } from "./readAvatars";

/** Writes the demo company inside the caller's transaction. */
export type DemoFill = (tx: Tx) => Promise<void>;

/**
 * Reads the demo company's avatars, so no file I/O runs while a transaction holds locks, and
 * returns its fill: the demo company for an instance without employees, otherwise nothing.
 */
export async function prepareDemoFill(today: CalendarDate = todayInUtc()): Promise<DemoFill> {
  const people = demoPeople(today);
  const avatars = await readAvatars(people.map(({ key }) => key));
  // Broccoli fills the sample company; the caller's own access was checked before.
  const ctx = PrincipalSecurityContext.system();
  return (tx) =>
    createDemoEmployees(
      ctx,
      tx,
      people.map(({ employee }, index) => ({ employee, avatar: avatars[index]! })),
      { kind: "ADDED_WITH_DEMO" },
    );
}
