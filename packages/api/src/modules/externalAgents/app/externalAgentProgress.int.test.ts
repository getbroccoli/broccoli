import {
  expect,
  externalAgentUseCases,
  importUseCases,
  importSourceValues,
  SETUP_HOLDER,
  SYSTEM,
  test,
} from "#test/support";

test("shows each reported file stage without adding people", async ({ orm, seed }) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Codex",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, CSV);
  const imports = importUseCases(orm);
  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toMatchObject([
    { id, externalAgentProgress: null, pickedUpByExternalAgentAt: null },
  ]);

  for (const progress of ["file_found", "file_downloading", "file_mapping"] as const) {
    await agents.files.reportFileProgress(ctx, id, progress);
    expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toMatchObject([
      {
        id,
        status: "mapping",
        externalAgentProgress: progress,
        pickedUpByExternalAgentAt: expect.any(Date) as unknown,
      },
    ]);
  }
  expect((await imports.reads.listEmployeeRecords(SETUP_HOLDER, { sourceId: id })).edges).toEqual(
    [],
  );
  const questions = await agents.files.readMappingQuestions(ctx, id);
  const sheets = questions.sheets.map(({ sheet }) => ({
    sheet,
    answers: {
      headerRow: "1",
      fullName: "A",
      firstName: "none",
      lastName: "none",
      email: "B",
      jobTitle: "none",
      startDate: "none",
    },
  }));
  await agents.files.answerMappingQuestions(ctx, id, { sheets });
  await expect(agents.files.reportFileProgress(ctx, id, "file_found")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  await imports.originalFileReads.allowOriginalFileRead(SETUP_HOLDER, id, "external_agent");
  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toMatchObject([
    { id, externalAgentProgress: null, pickedUpByExternalAgentAt: null },
  ]);
  await agents.files.reportFileProgress(ctx, id, "file_downloading");
  expect((await imports.reads.listSources(SETUP_HOLDER)).map(importSourceValues)).toMatchObject([
    { id, externalAgentProgress: "file_downloading" },
  ]);
  await agents.sessions.disconnectExternalAgent(SETUP_HOLDER);
  await expect(agents.files.reportFileProgress(ctx, id, "file_found")).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
  });
});

test("refuses progress for unknown files and files waiting for original-read consent", async ({
  orm,
  seed,
}) => {
  await seed.externalAgentSetup();
  const agents = externalAgentUseCases(orm);
  const { code } = await agents.sessions.createExternalAgentCode(SETUP_HOLDER);
  const { token } = await agents.sessions.startExternalAgentSession(SYSTEM, {
    code,
    client: "Codex",
  });
  const ctx = (await agents.sessions.readExternalAgentSession({ token }))!;
  await expect(
    agents.files.reportFileProgress(ctx, "00000000-0000-4000-8000-000000000000", "file_found"),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  const id = await agents.files.uploadForExternalAgent(SETUP_HOLDER, {
    name: "staff.pdf",
    bytes: Buffer.from("%PDF-1.4\n%%EOF"),
  });
  await expect(agents.files.reportFileProgress(ctx, id, "file_downloading")).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(
    (await importUseCases(orm).reads.listSources(SETUP_HOLDER)).map(importSourceValues),
  ).toMatchObject([{ id, externalAgentProgress: null, pickedUpByExternalAgentAt: null }]);
});

const CSV = { name: "staff.csv", bytes: Buffer.from("Name,Email\nAvery Stone,avery@example.com") };
