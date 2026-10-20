import { demoUseCases, expect, OWNER, storedFileIds, test } from "#test/support";

import { prepareDemoFill } from "./prepareDemoFill";
import { createEmployeeUseCases } from "../../../employees";
import { parseCalendarDate } from "../../../../utils";

test("fills 40 demo employees with distinct stored avatars", async ({ orm, transact }) => {
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });

  await transact(await prepareDemoFill(today));

  const employees = await listEmployees(OWNER, { first: 100 });
  const avatarIds = employees.edges.map(({ node }) => node.avatarFileId);
  expect(employees.edges).toHaveLength(40);
  expect(new Set(avatarIds).size).toBe(40);
  expect(avatarIds).not.toContain(null);
  expect(avatarIds.toSorted()).toEqual(await storedFileIds(orm));
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: true });
});

test("adds nothing when demo data has already been filled", async ({ orm, transact }) => {
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });
  const fill = await prepareDemoFill(today);
  await transact(fill);
  const before = await listEmployees(OWNER, { first: 100 });
  const filesBefore = await storedFileIds(orm);

  await transact(fill);

  expect(await listEmployees(OWNER, { first: 100 })).toEqual(before);
  expect(await storedFileIds(orm)).toEqual(filesBefore);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: true });
});

test("does not fill demo data when a real employee exists", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const demo = demoUseCases(orm);
  const { listEmployees } = createEmployeeUseCases({ orm });

  await transact(await prepareDemoFill(today));

  const employees = await listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await demo.getDemoData(OWNER)).toEqual({ isPresent: false });
});

const today = parseCalendarDate("2026-10-13")!;
