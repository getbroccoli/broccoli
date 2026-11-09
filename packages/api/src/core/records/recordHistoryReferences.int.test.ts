import { EXAMPLE_REGISTRATION, expect, OWNER, signedIn, test, recordHistory } from "#test/support";

import type { Grant } from "../security";
import { createRecordHistoryReaderService } from ".";

test("hides only reference sides whose record subjects are out of scope", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee();
  const other = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, grants: [READ_SELF] });
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      reason: "Changed owner",
      records: [
        {
          recordId: "example-1",
          changes: [
            {
              field: "owner",
              oldValue: "other-1",
              oldLabel: "Other",
              newValue: "own-1",
              newLabel: "Own",
            },
            { field: "title", oldValue: "other-1", newValue: "own-1" },
          ],
        },
        {
          recordId: "example-2",
          changes: [
            {
              field: "owner",
              oldValue: "own-1",
              oldLabel: "Own",
              newValue: "other-1",
              newLabel: "Other",
            },
          ],
        },
      ],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, {
    example: { ...EXAMPLE_REGISTRATION, references: { owner: "other_example" } },
    other_example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () =>
        Promise.resolve(
          new Map([
            ["own-1", employee.id],
            ["other-1", other.id],
          ]),
        ),
    },
  });

  const visible = await reader.hideOutOfScopeReferences(ctx, lines);

  expect(visible).toEqual([
    {
      ...lines[0],
      changes: [
        {
          field: "owner",
          oldValue: null,
          oldLabel: null,
          oldHidden: true,
          newValue: "own-1",
          newLabel: "Own",
          newHidden: false,
        },
        {
          field: "title",
          oldValue: "other-1",
          newValue: "own-1",
          oldHidden: false,
          newHidden: false,
        },
      ],
    },
    {
      ...lines[1],
      changes: [
        {
          field: "owner",
          oldValue: "own-1",
          oldLabel: "Own",
          oldHidden: false,
          newValue: null,
          newLabel: null,
          newHidden: true,
        },
      ],
    },
  ]);
});

test.for(["all", "self"] as const)(
  "keeps a deleted reference only with read on all (%s)",
  async (scope, { orm, seed, transact }) => {
    const employee = await seed.employee();
    const ctx = signedIn(orm, { employeeId: employee.id, grants: [{ ...READ_SELF, scope }] });
    const lines = await transact((tx) =>
      recordHistory.append(OWNER, tx, {
        recordType: "example",
        operation: "UPDATED",
        cause: { kind: "EDITED_DIRECTLY" },
        records: [
          {
            recordId: "example-1",
            changes: [
              {
                field: "owner",
                oldValue: "deleted-1",
                oldLabel: "Former owner",
                newValue: null,
                newLabel: null,
              },
            ],
          },
        ],
      }),
    );
    const reader = createRecordHistoryReaderService(orm, {
      example: { ...EXAMPLE_REGISTRATION, references: { owner: "other_example" } },
      other_example: EXAMPLE_REGISTRATION,
    });

    const visible = await reader.hideOutOfScopeReferences(ctx, lines);

    expect(visible).toEqual([
      {
        ...lines[0],
        changes: [
          {
            field: "owner",
            oldValue: scope === "all" ? "deleted-1" : null,
            oldLabel: scope === "all" ? "Former owner" : null,
            oldHidden: scope !== "all",
            newValue: null,
            newLabel: null,
            newHidden: false,
          },
        ],
      },
    ]);
  },
);

test("hides a reference without refusing the line when its object has no read grant", async ({
  orm,
  seed,
  transact,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, { employeeId: employee.id, grants: [] });
  const lines = await transact((tx) =>
    recordHistory.append(OWNER, tx, {
      recordType: "example",
      operation: "UPDATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        {
          recordId: "example-1",
          changes: [{ field: "owner", oldValue: null, newValue: "own-1", newLabel: "Own" }],
        },
      ],
    }),
  );
  const reader = createRecordHistoryReaderService(orm, {
    example: { ...EXAMPLE_REGISTRATION, references: { owner: "other_example" } },
    other_example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () => Promise.resolve(new Map([["own-1", employee.id]])),
    },
  });

  const visible = await reader.hideOutOfScopeReferences(ctx, lines);

  expect(visible).toEqual([
    {
      ...lines[0],
      changes: [
        {
          field: "owner",
          oldValue: null,
          oldHidden: false,
          newValue: null,
          newLabel: null,
          newHidden: true,
        },
      ],
    },
  ]);
});

const READ_SELF: Grant = {
  key: "example.read.self",
  object: "example",
  actions: ["read"],
  scope: "self",
};
