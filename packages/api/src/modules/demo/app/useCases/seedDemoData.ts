import type { SecurityContext } from "../../../../core/security";
import type { CalendarDate } from "../../../../utils";
import { createDemoEmployees, hasEmployees } from "../../../employees";
import { demoPeople } from "../../domain";
import type { DemoContext } from "./demoContext";
import { readAvatars } from "./readAvatars";

/** Fills an instance without employees with the demo company; otherwise does nothing. */
export async function seedDemoData(
  { transact }: DemoContext,
  ctx: SecurityContext,
  today: CalendarDate,
) {
  ctx.requireOwnerOrSystem();
  const people = demoPeople(today);
  // Read before the transaction opens, so no file I/O runs while it holds locks.
  const avatars = await readAvatars(people.map(({ key }) => key));
  await transact(async (tx) => {
    if (await hasEmployees(ctx, tx)) {
      return;
    }
    await createDemoEmployees(
      ctx,
      tx,
      people.map(({ employee }, index) => ({ employee, avatar: avatars[index]! })),
    );
  });
}
