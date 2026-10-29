import {
  employeeUseCases,
  expect,
  OWNER,
  signedIn,
  test,
  type TestSeed,
  WEBP,
} from "#test/support";

import type { Grant } from "../../../../core/security";

test("lists the caller and everyone below them in the reporting line", async ({ orm, seed }) => {
  const { mia, ann, leo } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });

  const page = await employeeUseCases(orm).listEmployees(ctx, {});

  expect(page.edges.map(({ node }) => node.id)).toEqual([ann.id, leo.id, mia.id]);
});

test("pages only through in-scope employees and ends without exposing another page", async ({
  orm,
  seed,
}) => {
  const { mia, ann, leo } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });
  const { listEmployees } = employeeUseCases(orm);

  const first = await listEmployees(ctx, { first: 2 });
  const second = await listEmployees(ctx, { first: 2, after: first.pageInfo.endCursor });

  expect(first.edges.map(({ node }) => node.id)).toEqual([ann.id, leo.id]);
  expect(first.pageInfo).toEqual({ hasNextPage: true, endCursor: first.edges.at(-1)!.cursor });
  expect(second.edges.map(({ node }) => node.id)).toEqual([mia.id]);
  expect(second.pageInfo).toEqual({ hasNextPage: false, endCursor: second.edges.at(-1)!.cursor });
});

test("returns no search results for an employee out of scope", async ({ orm, seed }) => {
  const { mia } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });

  const page = await employeeUseCases(orm).listEmployees(ctx, { filter: { search: "Zed" } });

  expect(page).toEqual({ edges: [], pageInfo: { hasNextPage: false, endCursor: null } });
});

test("reads the avatar of a report in scope", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  const mia = await seed.employee({ firstName: "Mia" });
  const ann = await seed.employee({ firstName: "Ann", avatarFileId });
  await seed.manager(ann.id, mia.id);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });

  const avatar = await employeeUseCases(orm).readAvatar(ctx, avatarFileId);

  expect(avatar).toEqual({ content: WEBP, mimeType: "image/webp" });
});

test("reads a shared avatar when any employee using it is in scope", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  await seed.employee({ firstName: "Zed", avatarFileId });
  const mia = await seed.employee({ firstName: "Mia" });
  const ann = await seed.employee({ firstName: "Ann", avatarFileId });
  await seed.manager(ann.id, mia.id);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });

  const avatar = await employeeUseCases(orm).readAvatar(ctx, avatarFileId);

  expect(avatar).toEqual({ content: WEBP, mimeType: "image/webp" });
});

test("refuses the avatar of an employee out of scope", async ({ orm, seed }) => {
  const avatarFileId = await seed.file({ content: WEBP, mimeType: "image/webp" });
  const mia = await seed.employee({ firstName: "Mia" });
  await seed.employee({ firstName: "Zed", avatarFileId });
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });

  await expect(employeeUseCases(orm).readAvatar(ctx, avatarFileId)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "You are not allowed to do this.",
  });
});

test("returns a report's manager but hides the caller's out-of-scope manager", async ({
  orm,
  seed,
}) => {
  const { mia, ann } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_REPORTS],
  });

  const managers = await employeeUseCases(orm).readManagers(ctx, [ann.id, mia.id]);

  expect(managers).toEqual(new Map([[ann.id, mia]]));
});

test("returns the caller's manager with self and managers read scopes", async ({ orm, seed }) => {
  const { boss, mia } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_MANAGERS],
  });

  const managers = await employeeUseCases(orm).readManagers(ctx, [mia.id]);

  expect(managers).toEqual(new Map([[mia.id, boss]]));
});

test("hides an out-of-scope employee's manager even when that manager is in scope", async ({
  orm,
  seed,
}) => {
  const { boss, mia } = await reportingLine(seed);
  const kim = await seed.employee({ firstName: "Kim" });
  await seed.manager(kim.id, boss.id);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [READ_SELF, READ_MANAGERS],
  });

  const managers = await employeeUseCases(orm).readManagers(ctx, [kim.id]);

  expect(managers).toEqual(new Map());
});

test("lists only immediate reports with the direct_reports scope", async ({ orm, seed }) => {
  const { mia, ann } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [{ ...READ_REPORTS, scope: "direct_reports" }],
  });

  const page = await employeeUseCases(orm).listEmployees(ctx, {});

  expect(page.edges.map(({ node }) => node.id)).toEqual([ann.id]);
});

test("updates an unreadable report but returns neither the employee nor the history line", async ({
  orm,
  seed,
}) => {
  const { mia, ann } = await reportingLine(seed);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [
      READ_SELF,
      {
        key: "employee.update.reports",
        object: "employee",
        actions: ["update"],
        scope: "all_reports",
        fields: ["jobTitle"],
      },
    ],
  });
  const employees = employeeUseCases(orm);

  const result = await employees.updateEmployee(ctx, { id: ann.id, jobTitle: "Lead" });

  expect(result).toEqual({ employee: null, historyLine: null });
  expect(await employees.readEmployee(OWNER, ann.id)).toMatchObject({ jobTitle: "Lead" });
  const history = await employees.readEmployeeHistory(OWNER, ann.id, {});
  expect(history.edges.map(({ node }) => node.changes)).toEqual([
    [{ field: "jobTitle", oldValue: null, newValue: "Lead" }],
  ]);
});

test("deleting a manager returns only readable report history while storing every report's line", async ({
  orm,
  seed,
}) => {
  const boss = await seed.employee({ firstName: "Boss" });
  const ann = await seed.employee({ firstName: "Ann" });
  const mia = await seed.employee({ firstName: "Mia" });
  await seed.manager(ann.id, boss.id);
  await seed.manager(mia.id, boss.id);
  const ctx = signedIn(orm, {
    employeeId: mia.id,
    grants: [
      READ_SELF,
      { key: "employee.delete.all", object: "employee", actions: ["delete"], scope: "all" },
    ],
  });
  const employees = employeeUseCases(orm);

  const result = await employees.deleteEmployee(ctx, { id: boss.id });

  expect(result.deletedEmployeeId).toBe(boss.id);
  expect(await employees.readEmployee(OWNER, boss.id)).toBeNull();
  expect(result.reportHistoryLines.map(({ recordId }) => recordId)).toEqual([mia.id]);
  const ownHistory = await employees.readEmployeeHistory(ctx, mia.id, {});
  expect(result.reportHistoryLines).toEqual(ownHistory.edges.map(({ node }) => node));
  const annHistory = await employees.readEmployeeHistory(OWNER, ann.id, {});
  expect(annHistory.edges.map(({ node }) => node)).toMatchObject([
    {
      recordId: ann.id,
      operation: "UPDATED",
      cause: { kind: "MANAGER_REMOVED", ref: boss.id },
      changes: [{ field: "manager", oldValue: boss.id, newValue: null }],
    },
  ]);
});

async function reportingLine(seed: TestSeed) {
  const boss = await seed.employee({ firstName: "Boss" });
  const mia = await seed.employee({ firstName: "Mia" });
  const ann = await seed.employee({ firstName: "Ann" });
  const leo = await seed.employee({ firstName: "Leo" });
  await seed.employee({ firstName: "Zed" });
  await seed.manager(mia.id, boss.id);
  await seed.manager(ann.id, mia.id);
  await seed.manager(leo.id, ann.id);
  return { boss, mia, ann, leo };
}

const READ_SELF: Grant = {
  key: "employee.read.self",
  object: "employee",
  actions: ["read"],
  scope: "self",
};
const READ_REPORTS: Grant = {
  key: "employee.read.reports",
  object: "employee",
  actions: ["read"],
  scope: "all_reports",
};
const READ_MANAGERS: Grant = {
  key: "employee.read.managers",
  object: "employee",
  actions: ["read"],
  scope: "managers",
};
