import {
  companyUseCases,
  expect,
  importUseCases,
  SETUP_EXTERNAL_AGENT,
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
  "reads.readProgress",
  "reads.readReview",
  "reads.listEmployeeRecords",
  "readImportPhoto",
  "choices.chooseEmployeeValue",
  "choices.chooseSourceForAll",
  "choices.setLeftOut",
  "choices.leaveOutIncomplete",
  "company.update",
  "readSlack",
  "ai.save",
] as const)("%s refuses the external agent", async (operation, { orm }) => {
  const imports = importUseCases(orm);
  const calls = {
    approveImport: () => imports.approveImport(SETUP_EXTERNAL_AGENT, "reviewed-version"),
    resetSetup: () => imports.resetSetup(SETUP_EXTERNAL_AGENT),
    startDemo: () => imports.startDemo(SETUP_EXTERNAL_AGENT),
    "files.uploadFile": () =>
      imports.files.uploadFile(SETUP_EXTERNAL_AGENT, {
        name: "staff.csv",
        bytes: Buffer.from("Name\nAvery Stone"),
      }),
    "reads.listSources": () => imports.reads.listSources(SETUP_EXTERNAL_AGENT),
    "reads.readSources": () => imports.reads.readSources(SETUP_EXTERNAL_AGENT, []),
    "reads.countEmployees": () => imports.reads.countEmployees(SETUP_EXTERNAL_AGENT, []),
    "reads.readProgress": () => imports.reads.readProgress(SETUP_EXTERNAL_AGENT),
    "reads.readReview": () => imports.reads.readReview(SETUP_EXTERNAL_AGENT),
    "reads.listEmployeeRecords": () =>
      imports.reads.listEmployeeRecords(SETUP_EXTERNAL_AGENT, { sourceId: "missing" }),
    readImportPhoto: () => imports.readImportPhoto(SETUP_EXTERNAL_AGENT, "missing"),
    "choices.chooseEmployeeValue": () =>
      imports.choices.chooseEmployeeValue(SETUP_EXTERNAL_AGENT, {
        key: "missing",
        field: "jobTitle",
        choice: null,
      }),
    "choices.chooseSourceForAll": () =>
      imports.choices.chooseSourceForAll(SETUP_EXTERNAL_AGENT, {
        field: "jobTitle",
        sourceId: "missing",
      }),
    "choices.setLeftOut": () =>
      imports.choices.setLeftOut(SETUP_EXTERNAL_AGENT, { key: "missing", leftOut: true }),
    "choices.leaveOutIncomplete": () =>
      imports.choices.leaveOutIncomplete(SETUP_EXTERNAL_AGENT, { reason: "email" }),
    "company.update": () =>
      companyUseCases(orm).update(SETUP_EXTERNAL_AGENT, { name: "Changed company" }),
    readSlack: () => imports.readSlack(SETUP_EXTERNAL_AGENT),
    "ai.save": () => systemUseCases(orm).ai.save(SETUP_EXTERNAL_AGENT, { source: "broccoli_ai" }),
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
