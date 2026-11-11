import {
  employeeSetup,
  expect,
  OWNER,
  recordHistory,
  seedOwnWeek,
  test,
  timeOffPolicyService,
  workingPatternService,
} from "#test/support";
import { workingPatternRepository } from "../db";

test("deleting all employees purges working pattern history", async ({ orm, seed, transact }) => {
  const employee = await seed.employee();
  const patterns = workingPatternService(orm);
  const termsId = await seed.defaultTermsId();
  const [assignment] = await workingPatternRepository(orm).findAssignments({ termsIds: [termsId] });
  await seedOwnWeek(orm, {
    employeeId: employee.id,
    versionId: assignment!.versionId,
    startDate: "2026-01-01",
  });
  const draft = await patterns.saveWorkingPattern(OWNER, {
    termsId,
    minutes: [480, 480, 480, 480, 0, 0, 0],
    bankHolidayCalendar: "scotland",
  });
  await timeOffPolicyService(orm).publishTerms(OWNER, {
    termsId,
    versions: [{ id: draft.id, revision: draft.revision }],
    startDate: "2026-06-01",
    owners: [{ employeeId: employee.id }],
  });
  expect((await recordHistory.read(orm, "working_pattern", employee.id, {})).edges).toHaveLength(1);

  await transact((tx) => employeeSetup.deleteAllEmployees(OWNER, tx));

  expect((await recordHistory.read(orm, "working_pattern", employee.id, {})).edges).toEqual([]);
});
