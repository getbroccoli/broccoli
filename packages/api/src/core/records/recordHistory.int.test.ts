import { sql } from "drizzle-orm";

import {
  recordChangedEvents,
  EXAMPLE_RECORD,
  EXAMPLE_REGISTRATION,
  expect,
  NON_OWNER,
  OWNER,
  SETUP_EXTERNAL_AGENT,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

import { ormOf } from "../db";
import {
  appendRecordHistory,
  createRecordHistoryReader,
  purgeRecordHistory,
  readRecordHistory,
} from ".";

test("appends one line per record and reads a record's lines newest first", async ({
  orm,
  transact,
}) => {
  const records = [EXAMPLE_RECORD, { ...EXAMPLE_RECORD, recordId: "example-2" }];

  const created = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY", ref: "source-1" },
      reason: "Initial entry",
      records,
    }),
  );
  const updated = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        {
          recordId: EXAMPLE_RECORD.recordId,
          changes: [{ field: "title", oldValue: "First", newValue: "Second" }],
        },
      ],
    }),
  );

  expect(created).toHaveLength(2);
  expect(created.map((line) => line.recordId)).toEqual(records.map((record) => record.recordId));
  for (const [index, line] of created.entries()) {
    expect(line).toEqual({
      id: expect.stringMatching(/^\d+$/) as unknown,
      recordType: "example",
      recordId: records[index]!.recordId,
      operation: "CREATED",
      occurredAt: expect.any(Date) as unknown,
      author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId },
      cause: { kind: "EDITED_DIRECTLY", ref: "source-1" },
      reason: "Initial entry",
      changes: EXAMPLE_RECORD.changes,
    });
  }
  expect(updated[0]).toMatchObject({ cause: { kind: "EDITED_DIRECTLY", ref: null }, reason: null });
  expect(
    (await readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, {})).edges.map(
      ({ node }) => node,
    ),
  ).toEqual([updated[0], created[0]]);
  expect(
    (await readRecordHistory(orm, "example", "example-2", {})).edges.map(({ node }) => node),
  ).toEqual([created[1]]);
});

test.for([
  { ctx: OWNER, author: { kind: "SIGNED_IN_USER", id: OWNER.user!.userId } },
  { ctx: SYSTEM, author: { kind: "BROCCOLI_ITSELF", id: null } },
  { ctx: SETUP_HOLDER, author: { kind: "SETUP_HOLDER", id: null } },
  {
    ctx: SETUP_EXTERNAL_AGENT,
    author: { kind: "EXTERNAL_AGENT", id: SETUP_EXTERNAL_AGENT.externalAgentSessionId },
  },
])("records the $author.kind author", async ({ ctx, author }, { orm, transact }) => {
  await transact((tx) =>
    appendRecordHistory(ctx, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );

  const { edges } = await readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, {});
  expect(edges.map(({ node }) => node.author)).toEqual([author]);
});

test("publishes one event per line only after commit, with field keys and no values", async ({
  orm,
}) => {
  const { transact, events } = recordChangedEvents(orm);

  const lines = await transact(async (tx) => {
    const lines = await appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY", ref: "source-1" },
      records: [EXAMPLE_RECORD, { ...EXAMPLE_RECORD, recordId: "example-2" }],
    });
    expect(events).toEqual([]);
    return lines;
  });

  expect(events).toEqual(
    lines.map((line) => ({
      historyId: line.id,
      recordType: "example",
      recordId: line.recordId,
      operation: "CREATED",
      fields: ["title"],
      causeKind: "EDITED_DIRECTLY",
      causeRef: "source-1",
    })),
  );
});

test("a rolled-back append keeps no lines and publishes nothing", async ({ orm }) => {
  const { transact, events } = recordChangedEvents(orm);

  await expect(
    transact(async (tx) => {
      await appendRecordHistory(OWNER, tx, {
        recordType: "example",
        operation: "CREATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [EXAMPLE_RECORD],
      });
      await ormOf(tx).execute(sql`select 1 / 0`);
    }),
  ).rejects.toMatchObject({ cause: { code: "22012" } });

  expect((await readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, {})).edges).toEqual([]);
  expect(events).toEqual([]);
});

test("continues newest-first paging from the cursor even after another append", async ({
  orm,
  transact,
}) => {
  const lines = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD, EXAMPLE_RECORD, EXAMPLE_RECORD],
    }),
  );
  const first = await readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, { first: 2 });
  await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );

  const second = await readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, {
    first: 2,
    after: first.pageInfo.endCursor,
  });

  expect(first.edges.map(({ node }) => node)).toEqual([lines[2], lines[1]]);
  expect(first.pageInfo).toEqual({ hasNextPage: true, endCursor: first.edges.at(-1)!.cursor });
  expect(second.edges.map(({ node }) => node)).toEqual([lines[0]]);
  expect(second.pageInfo).toEqual({ hasNextPage: false, endCursor: second.edges.at(-1)!.cursor });
});

test("purges every line of only the selected record type without publishing", async ({
  orm,
  transact,
}) => {
  await transact(async (tx) => {
    await appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD, { ...EXAMPLE_RECORD, recordId: "example-2" }],
    });
    await appendRecordHistory(OWNER, tx, {
      recordType: "other_example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    });
  });
  const other = await readRecordHistory(orm, "other_example", EXAMPLE_RECORD.recordId, {});
  const { transact: transactWithEvents, events } = recordChangedEvents(orm);

  const removed = await transactWithEvents((tx) => purgeRecordHistory(tx, "example"));

  expect(removed).toBe(2);
  expect((await readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, {})).edges).toEqual([]);
  expect((await readRecordHistory(orm, "example", "example-2", {})).edges).toEqual([]);
  expect(await readRecordHistory(orm, "other_example", EXAMPLE_RECORD.recordId, {})).toEqual(other);
  expect(events).toEqual([]);
});

test("refuses history of an unregistered type", async ({ orm }) => {
  const reader = createRecordHistoryReader(orm, {});

  await expect(
    reader.readHistory(OWNER, "example", EXAMPLE_RECORD.recordId, {}),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot read this history.",
  });
});

test("refuses history when the type's access check refuses", async ({ orm }) => {
  const reader = createRecordHistoryReader(orm, {
    example: {
      ...EXAMPLE_REGISTRATION,
      requireHistoryAccess: (ctx) => Promise.resolve().then(() => ctx.requireOwnerOrSystem()),
    },
  });

  await expect(
    reader.readHistory(NON_OWNER, "example", EXAMPLE_RECORD.recordId, {}),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
  });
});

test("reads history when the type's access check allows it", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReader(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(OWNER, "example", EXAMPLE_RECORD.recordId, {});

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("reads history through the record type's canonical id", async ({ orm, transact }) => {
  const lines = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReader(orm, { example: EXAMPLE_REGISTRATION });

  const page = await reader.readHistory(
    OWNER,
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
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReader(orm, {
    example: { ...EXAMPLE_REGISTRATION, canonicalId: () => null },
  });

  const page = await reader.readHistory(OWNER, "example", EXAMPLE_RECORD.recordId, {});

  expect(page).toEqual({ edges: [], pageInfo: { hasNextPage: false, endCursor: null } });
});

test("refuses a history cursor id beyond the signed 64-bit range", async ({ orm }) => {
  const after = Buffer.from(JSON.stringify(["NEWEST", "DESC", "9223372036854775808"])).toString(
    "base64url",
  );

  await expect(
    readRecordHistory(orm, "example", EXAMPLE_RECORD.recordId, { after }),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    fieldErrors: [{ field: "after", code: "invalid" }],
  });
});
