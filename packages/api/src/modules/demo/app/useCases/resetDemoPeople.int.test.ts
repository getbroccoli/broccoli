import { companyUseCases, expect, PNG, storedFileIds, test } from "#test/support";

import { readFile } from "../../../../core/files";
import { parseCalendarDate } from "../../../../utils";
import { createEmployeeUseCases } from "../../../employees";
import { prepareDemoFill, resetDemoPeople } from ".";

test("resetting demo people deletes every employee and demo avatar but keeps the company", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.demoOwner({ expiresAt: new Date("2026-10-20T12:00:00Z") });
  const company = companyUseCases(orm);
  await company.update(owner, { name: "Acme Corp" });
  const savedCompany = await company.saveLogo(owner, PNG);
  await transact(await prepareDemoFill(parseCalendarDate("2026-10-13")));
  await seed.employee();
  const employees = createEmployeeUseCases({ orm });
  expect((await employees.listEmployees(owner, { first: 100 })).edges).toHaveLength(41);
  expect(await storedFileIds(orm)).toHaveLength(41);
  const logo = await readFile(orm, savedCompany.logoFileId!);

  await transact((tx) => resetDemoPeople(owner, tx));

  expect((await employees.listEmployees(owner, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([savedCompany.logoFileId]);
  expect(await company.getCompany(owner)).toEqual(savedCompany);
  expect(await readFile(orm, savedCompany.logoFileId!)).toEqual(logo);
});
