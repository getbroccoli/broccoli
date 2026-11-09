import {
  EXAMPLE_RECORD,
  EXAMPLE_REGISTRATION,
  expect,
  OWNER,
  recordHistory,
  SYSTEM,
  test,
} from "#test/support";

import { createRecordHistoryReaderService } from ".";

test("reads only lines that change one of the listed fields", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [["firstName"], ["firstName", "terms"], ["workingWeek"], ["termsExtra"]].map(
        (fields) => ({
          recordId: EXAMPLE_RECORD.recordId,
          changes: fields.map((field) => ({ field, oldValue: null, newValue: "Changed" })),
        }),
      ),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    changingAnyOf: ["terms", "workingWeek"],
  });

  expect(page.edges.map(({ node }) => node)).toEqual([lines[2], lines[1]]);
});

test("matches every field under a name ending in *", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: ["timeOff.annual", "timeOff.sickness", "timeOff", "timeOffExtra.annual"].map(
        (field) => ({
          recordId: EXAMPLE_RECORD.recordId,
          changes: [{ field, oldValue: null, newValue: "Changed" }],
        }),
      ),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    changingAnyOf: ["timeOff.*"],
  });

  expect(page.edges.map(({ node }) => node)).toEqual([lines[1], lines[0]]);
});

test("reads only lines that change none of the listed fields", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        ["firstName", "startDate"],
        ["firstName", "terms"],
        ["timeOff.annual"],
        ["timeOff"],
      ].map((fields) => ({
        recordId: EXAMPLE_RECORD.recordId,
        changes: fields.map((field) => ({ field, oldValue: null, newValue: "Changed" })),
      })),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    changingNoneOf: ["terms", "timeOff.*"],
  });

  expect(page.edges.map(({ node }) => node)).toEqual([lines[3], lines[0]]);
});

test("pages through the kept lines only", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: ["firstName", "terms", "startDate", "terms", "firstName"].map((field) => ({
        recordId: EXAMPLE_RECORD.recordId,
        changes: [{ field, oldValue: null, newValue: "Changed" }],
      })),
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const first = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    first: 1,
    changingAnyOf: ["terms"],
  });
  const second = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {
    first: 1,
    after: first.pageInfo.endCursor,
    changingAnyOf: ["terms"],
  });

  expect(first.edges.map(({ node }) => node)).toEqual([lines[3]]);
  expect(first.pageInfo.hasNextPage).toBe(true);
  expect(second.edges.map(({ node }) => node)).toEqual([lines[1]]);
  expect(second.pageInfo.hasNextPage).toBe(false);
});
