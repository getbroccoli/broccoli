import {
  EXAMPLE_RECORD,
  EXAMPLE_REGISTRATION,
  expect,
  OWNER,
  SYSTEM,
  signedIn,
  test,
} from "#test/support";

import type { Grant } from "../security";
import { readRecordAccess } from "./app";
import { appendRecordHistory, createRecordHistoryReader, readRecordHistory } from ".";

test("refuses history of an unregistered type", async ({ orm }) => {
  const reader = createRecordHistoryReader(orm, {});

  await expect(
    reader.readHistory(OWNER, "example", EXAMPLE_RECORD.recordId, {}),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You cannot read this history.",
  });
});

test("reads history when the record's subject is in scope", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [READ_SELF],
  });
  const lines = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "CREATED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReader(orm, {
    example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () => Promise.resolve(new Map([[EXAMPLE_RECORD.recordId, employee.id]])),
    },
  });

  const page = await reader.readHistory(ctx, "example", EXAMPLE_RECORD.recordId, {});

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("refuses history when the record's subject is out of scope", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const other = await seed.employee();
  const ctx = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [READ_SELF],
  });
  const reader = createRecordHistoryReader(orm, {
    example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () => Promise.resolve(new Map([[EXAMPLE_RECORD.recordId, other.id]])),
    },
  });

  await expect(
    reader.readHistory(ctx, "example", EXAMPLE_RECORD.recordId, {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "You are not allowed to do this." });
});

test("reads a deleted record's history only with read on all", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const narrow = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [READ_SELF],
  });
  const broad = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [{ ...READ_SELF, scope: "all" }],
  });
  const lines = await transact((tx) =>
    appendRecordHistory(OWNER, tx, {
      recordType: "example",
      operation: "DELETED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [EXAMPLE_RECORD],
    }),
  );
  const reader = createRecordHistoryReader(orm, { example: EXAMPLE_REGISTRATION });

  await expect(
    reader.readHistory(narrow, "example", EXAMPLE_RECORD.recordId, {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN", message: "You are not allowed to do this." });
  const page = await reader.readHistory(broad, "example", EXAMPLE_RECORD.recordId, {});

  expect(page.edges.map(({ node }) => node)).toEqual(lines);
});

test("reads records through their subjects, including two records of the same subject", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const other = await seed.employee();
  const ctx = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [READ_SELF],
  });
  const reader = createRecordHistoryReader(orm, {
    example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () =>
        Promise.resolve(
          new Map([
            ["example-1", employee.id],
            ["example-2", other.id],
            ["example-3", employee.id],
          ]),
        ),
      loadRecords: () =>
        Promise.resolve(
          new Map([
            ["example-1", { title: "First" }],
            ["example-2", { title: "Hidden" }],
            ["example-3", { title: "Third" }],
          ]),
        ),
    },
  });

  const records = await reader.readRecords(ctx, "example", ["example-1", "example-2", "example-3"]);

  expect(records).toEqual(
    new Map([
      ["example-1", { title: "First", __typename: "Example" }],
      ["example-3", { title: "Third", __typename: "Example" }],
    ]),
  );
});

test.for(["self", "all"] as const)(
  "reads public records with self but allows updating them only with all (%s)",
  async (scope, { orm, seed }) => {
    const employee = await seed.employee();
    const ctx = signedIn(orm, {
      profiles: ["EMPLOYEE"],
      employeeId: employee.id,
      grants: [READ_SELF, { ...UPDATE_SELF, scope }],
    });
    const registration = {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () => Promise.resolve(new Map([["example-1", "public"]])),
      loadRecords: () => Promise.resolve(new Map([["example-1", { title: "Public" }]])),
    };
    const reader = createRecordHistoryReader(orm, { example: registration });

    const records = await reader.readRecords(ctx, "example", ["example-1"]);
    const access = await readRecordAccess(ctx, registration, ["example-1"]);

    expect(records).toEqual(new Map([["example-1", { title: "Public", __typename: "Example" }]]));
    expect(access.get("example-1")).toEqual({
      canUpdate: scope === "all",
      canDelete: false,
      editableFields: scope === "all" ? ["title"] : [],
    });
  },
);

test("refuses public history and hides embedded public records without a read grant", async ({
  orm,
  seed,
}) => {
  const employee = await seed.employee();
  const ctx = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [UPDATE_SELF],
  });
  const reader = createRecordHistoryReader(orm, {
    example: {
      ...EXAMPLE_REGISTRATION,
      subjectsOf: () => Promise.resolve(new Map([["example-1", "public"]])),
      loadRecords: () => Promise.resolve(new Map([["example-1", { title: "Public" }]])),
    },
  });

  await expect(reader.readHistory(ctx, "example", "example-1", {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });
  expect(await reader.readRecords(ctx, "example", ["example-1"])).toEqual(new Map());
});

test("answers access through each subject and allows deleting the owner's non-employee records", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  const employee = await seed.employee({ userId: owner.user!.userId });
  const other = await seed.employee();
  const ctx = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [
      UPDATE_SELF,
      { key: "example.delete.self", object: "example", actions: ["delete"], scope: "self" },
    ],
  });
  const registration = {
    ...EXAMPLE_REGISTRATION,
    subjectsOf: () =>
      Promise.resolve(
        new Map([
          ["example-1", employee.id],
          ["example-2", other.id],
          ["example-3", employee.id],
        ]),
      ),
  };

  const access = await readRecordAccess(ctx, registration, ["example-1", "example-2", "example-3"]);

  expect(access).toEqual(
    new Map([
      ["example-1", { canUpdate: true, canDelete: true, editableFields: ["title"] }],
      ["example-2", { canUpdate: false, canDelete: false, editableFields: [] }],
      ["example-3", { canUpdate: true, canDelete: true, editableFields: ["title"] }],
    ]),
  );
});

test("permits writing a public record only with update on all", async ({ orm, seed }) => {
  const employee = await seed.employee();
  const narrow = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [UPDATE_SELF],
  });
  const broad = signedIn(orm, {
    profiles: ["EMPLOYEE"],
    employeeId: employee.id,
    grants: [{ ...UPDATE_SELF, scope: "all" }],
  });

  await expect(narrow.requireWrite("example", "public", ["title"])).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });
  await expect(broad.requireWrite("example", "public", ["title"])).resolves.toBeUndefined();
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

  const page = await reader.readHistory(SYSTEM, "example", EXAMPLE_RECORD.recordId, {});

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

const READ_SELF: Grant = {
  key: "example.read.self",
  object: "example",
  actions: ["read"],
  scope: "self",
};
const UPDATE_SELF: Grant = {
  key: "example.update.self",
  object: "example",
  actions: ["update"],
  scope: "self",
  fields: ["title"],
};
