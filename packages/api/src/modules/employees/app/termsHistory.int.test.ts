import {
  employeeSetup,
  expect,
  OWNER,
  readTimeOffTerms,
  scotlandTimeOffSetup,
  test,
  timeOffService,
} from "#test/support";

import { createRecordHistoryReaderService } from "../../../core/records";
import { termsRecordType } from ".";

test("turning time off on writes one set-up history line for each terms, including the default", async ({
  orm,
  transact,
}) => {
  const history = createRecordHistoryReaderService(orm, { terms: termsRecordType(orm) });
  const service = timeOffService(orm, { today: "2026-11-06" });

  await transact((tx) => service.turnOnTimeOff(OWNER, tx, scotlandTimeOffSetup()));

  const terms = await readTimeOffTerms(orm);
  expect(terms.map(({ name }) => name)).toEqual(["England and Wales", "Scotland"]);
  for (const { id, name } of terms) {
    const page = await history.readHistory(OWNER, "terms", id, {});
    expect(page.edges.map(({ node }) => node)).toMatchObject([
      {
        recordType: "terms",
        recordId: id,
        operation: "CREATED",
        cause: { kind: "TIME_OFF_TURNED_ON" },
        changes: [{ field: "name", oldValue: null, newValue: name }],
      },
    ]);
  }
});

test("starting over removes history for the default and the other terms", async ({
  orm,
  transact,
}) => {
  const history = createRecordHistoryReaderService(orm, { terms: termsRecordType(orm) });
  await transact((tx) => timeOffService(orm).turnOnTimeOff(OWNER, tx, scotlandTimeOffSetup()));
  const terms = await readTimeOffTerms(orm);
  for (const { id } of terms) {
    expect((await history.readHistory(OWNER, "terms", id, {})).edges).toHaveLength(1);
  }

  await transact((tx) => employeeSetup.deleteAllEmployees(OWNER, tx));

  for (const { id } of terms) {
    expect((await history.readHistory(OWNER, "terms", id, {})).edges).toEqual([]);
  }
});
