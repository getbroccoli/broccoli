import {
  companyUseCases,
  expect,
  importUseCases,
  SETUP_AGENT,
  SETUP_HOLDER,
  storedFileIds,
  systemUseCases,
  test,
} from "#test/support";

test.for([
  "approveImport",
  "resetSetup",
  "startDemo",
  "files.uploadFile",
  "reads.listSources",
  "reads.readSources",
  "reads.countEmployees",
  "reads.employeeCount",
  "reads.readyEmployeeCount",
  "reads.listReadyEmployeeSources",
  "reads.listEmployees",
  "reads.listEmployeeRecords",
  "reads.listChecks",
  "reads.isImportPhotoFile",
  "reads.readVersion",
  "reads.readSnapshot",
  "choices.chooseEmployeeValue",
  "choices.chooseSourceForAll",
  "choices.setLeftOut",
  "choices.leaveOutIncomplete",
  "company.update",
  "readSlack",
  "saveAiSource",
] as const)("%s refuses a setup agent", async (operation, { orm }) => {
  const imports = importUseCases(orm);
  const calls = {
    approveImport: () => imports.approveImport(SETUP_AGENT, "reviewed-version"),
    resetSetup: () => imports.resetSetup(SETUP_AGENT),
    startDemo: () => imports.startDemo(SETUP_AGENT),
    "files.uploadFile": () =>
      imports.files.uploadFile(SETUP_AGENT, {
        name: "staff.csv",
        bytes: Buffer.from("Name\nAvery Stone"),
      }),
    "reads.listSources": () => imports.reads.listSources(SETUP_AGENT),
    "reads.readSources": () => imports.reads.readSources(SETUP_AGENT, []),
    "reads.countEmployees": () => imports.reads.countEmployees(SETUP_AGENT, []),
    "reads.employeeCount": () => imports.reads.employeeCount(SETUP_AGENT),
    "reads.readyEmployeeCount": () => imports.reads.readyEmployeeCount(SETUP_AGENT),
    "reads.listReadyEmployeeSources": () => imports.reads.listReadyEmployeeSources(SETUP_AGENT),
    "reads.listEmployees": () => imports.reads.listEmployees(SETUP_AGENT, {}),
    "reads.listEmployeeRecords": () =>
      imports.reads.listEmployeeRecords(SETUP_AGENT, { sourceId: "missing" }),
    "reads.listChecks": () => imports.reads.listChecks(SETUP_AGENT),
    "reads.isImportPhotoFile": () => imports.reads.isImportPhotoFile(SETUP_AGENT, "missing"),
    "reads.readVersion": () => imports.reads.readVersion(SETUP_AGENT),
    "reads.readSnapshot": () => imports.reads.readSnapshot(SETUP_AGENT),
    "choices.chooseEmployeeValue": () =>
      imports.choices.chooseEmployeeValue(SETUP_AGENT, {
        key: "missing",
        field: "jobTitle",
        choice: null,
      }),
    "choices.chooseSourceForAll": () =>
      imports.choices.chooseSourceForAll(SETUP_AGENT, {
        field: "jobTitle",
        sourceId: "missing",
      }),
    "choices.setLeftOut": () =>
      imports.choices.setLeftOut(SETUP_AGENT, { key: "missing", leftOut: true }),
    "choices.leaveOutIncomplete": () =>
      imports.choices.leaveOutIncomplete(SETUP_AGENT, { reason: "email" }),
    "company.update": () => companyUseCases(orm).update(SETUP_AGENT, { name: "Changed company" }),
    readSlack: () => imports.readSlack(SETUP_AGENT),
    saveAiSource: () => systemUseCases(orm).saveAiSource(SETUP_AGENT, { source: "broccoli_ai" }),
  };

  await expect(
    Promise.resolve().then(async () => {
      await calls[operation]();
    }),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(imports.sentJobs).toEqual([]);
});
