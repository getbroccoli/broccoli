import { sql } from "drizzle-orm";

import { expect, test } from "#test/support";

import { employeeRepository } from ".";

test("sorts by start date regardless of the database date style", async ({ orm, seed }) => {
  const march = await seed.employee({ startDate: "2026-03-01" });
  const february = await seed.employee({ startDate: "2026-02-28" });

  const rows = await orm.transaction(async (tx) => {
    await tx.execute(sql`set local datestyle = 'German, DMY'`);
    return employeeRepository(tx).findPage({
      first: 10,
      after: null,
      order: { field: "START_DATE", direction: "ASC" },
      search: null,
    });
  });

  expect(rows.map((row) => row.node.id)).toEqual([february.id, march.id]);
});
