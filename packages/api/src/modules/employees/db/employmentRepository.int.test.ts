import { sql } from "drizzle-orm";

import { expect, test } from "#test/support";

import { parseCalendarDate } from "../../../utils";
import { employmentRepository } from ".";

test("returns managers from the direct manager upward", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const carl = await seed.employee({ firstName: "Carl" });
  await seed.manager(ben.id, anna.id);
  await seed.manager(carl.id, ben.id);

  const managers = await employmentRepository(orm).findManagersAbove(
    [carl.id],
    parseCalendarDate("2026-01-01")!,
  );

  expect(managers).toEqual(new Map([[carl.id, [ben.id, anna.id]]]));
});

test("returns separate reporting chains in direct-manager-first order", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const carl = await seed.employee({ firstName: "Carl" });
  const dana = await seed.employee({ firstName: "Dana" });
  const ellis = await seed.employee({ firstName: "Ellis" });
  await seed.manager(ben.id, anna.id);
  await seed.manager(carl.id, ben.id);
  await seed.manager(ellis.id, dana.id);

  const managers = await employmentRepository(orm).findManagersAbove(
    [carl.id, ellis.id],
    parseCalendarDate("2026-01-01")!,
  );

  expect(managers).toEqual(
    new Map([
      [carl.id, [ben.id, anna.id]],
      [ellis.id, [dana.id]],
    ]),
  );
});

test("stops at a stored reporting loop without repeating managers", async ({ orm, seed }) => {
  const anna = await seed.employee({ firstName: "Anna" });
  const ben = await seed.employee({ firstName: "Ben" });
  const carl = await seed.employee({ firstName: "Carl" });
  await seed.manager(carl.id, ben.id);
  await seed.manager(ben.id, anna.id);
  await seed.manager(anna.id, ben.id);

  const managers = await orm.transaction(async (tx) => {
    // A broken recursion must fail the test without leaving a query running after its timeout.
    await tx.execute(sql`set local statement_timeout = '5s'`);
    return employmentRepository(tx).findManagersAbove([carl.id], parseCalendarDate("2026-01-01")!);
  });

  expect(managers).toEqual(new Map([[carl.id, [ben.id, anna.id]]]));
});
