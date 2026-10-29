import { sql } from "drizzle-orm";

import { expect, test } from "#test/support";

import { employeeRepository } from ".";

// Use-case tests cover the repository otherwise. This bug needs a session setting on the
// connection that runs the query, which only a transaction handed to the repository allows:
// with a non-ISO DateStyle, sorting dates as plain text put 01.03.2026 before 28.02.2026.
test("sorts by start date regardless of the database date style", async ({ orm, seed }) => {
  const march = await seed.employee({ startDate: "2026-03-01" });
  const february = await seed.employee({ startDate: "2026-02-28" });

  const rows = await orm.transaction(async (tx) => {
    await tx.execute(sql`set local datestyle = 'German, DMY'`);
    return employeeRepository(tx).findPage({
      limit: 10,
      after: null,
      order: { field: "START_DATE", direction: "ASC" },
      search: null,
      scope: "all",
    });
  });

  expect(rows.map((row) => row.node.id)).toEqual([february.id, march.id]);
});
