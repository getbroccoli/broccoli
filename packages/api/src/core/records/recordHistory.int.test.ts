import {
  EXAMPLE_RECORD,
  EXAMPLE_REGISTRATION,
  READABLE_EXAMPLE_REGISTRATION,
  expect,
  OWNER,
  SYSTEM,
  signedIn,
  test,
  recordHistory,
} from "#test/support";

import type { Grant } from "../security";
import { createRecordHistoryReaderService } from ".";

test("reads history when the record's subject is in scope", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, {
    employeeId: employee.id,
    grants: [READ_SELF],
  });
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, {
    example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () => Promise.resolve(new Map([[EXAMPLE_RECORD.recordId, employee.id]])),
    },
  });

  const page = await reader.readHistory(ctx, "example", EXAMPLE_RECORD.recordId, {});

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("reads history when the record type's own rule allows its canonical id", async ({
  orm,
  transact,
}) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: READABLE_EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(
    OWNER,
    "example",
    EXAMPLE_RECORD.recordId.toUpperCase(),
    {},
  );

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("refuses history when the record type's own rule excludes the id", async ({
  orm,
  transact,
}) => {
  await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [{ ...EXAMPLE_RECORD, recordId: "example-2" }],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: READABLE_EXAMPLE_REGISTRATION });

  await expect(reader.readHistory(OWNER, "example", "example-2", {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot read this history.",
  });
});

test("reads a deleted record's history only with read on all", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const narrow = signedIn(orm, {
    employeeId: employee.id,
    grants: [READ_SELF],
  });
  const broad = signedIn(orm, {
    employeeId: employee.id,
    grants: [{ ...READ_SELF, scope: "all" }],
  });
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "DELETED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  await expect(
    reader.readHistory(narrow, "example", EXAMPLE_RECORD.recordId, {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "You are not allowed to do this." });
  const page = await reader.readHistory(broad, "example", EXAMPLE_RECORD.recordId, {});

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("reads history through the record type's canonical id", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(
    SYSTEM,
    "example",
    EXAMPLE_RECORD.recordId.toUpperCase(),
    {},
  );

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("returns an empty page when the record type cannot canonicalise the id", async ({
  orm,
  transact,
}) => {
  await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, {
    example: { ...EXAMPLE_REGISTRATION, canonicalId: () => null },
  });

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {});

  expect(page).toEqual({ edges: [], pageInfo: { hasNextPage: false, endCursor: null } });
});

const READ_SELF: Grant = {
  key: "example.read.self",
  object: "example",
  actions: ["read"],
  scope: "self",
};
