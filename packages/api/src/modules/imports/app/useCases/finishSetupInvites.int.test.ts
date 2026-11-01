import {
  employeeInviteService,
  employeeUseCases,
  expect,
  finishSelfHostedSetup,
  importUseCases,
  OWNER,
  SETUP_HOLDER,
  test,
} from "#test/support";

test("links the self-hosted owner and invites everyone else on their behalf", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
    { email: "robin@example.com" },
    { email: "taylor@example.com" },
  ]);
  const imports = importUseCases(orm);
  await imports.approveImport(SETUP_HOLDER, (await imports.reads.readReview(SETUP_HOLDER)).version);

  const invites = await finishSelfHostedSetup(orm, {
    ownerEmployeeKey: "avery@example.com",
    inviteAudience: "everyone",
  });

  const { edges } = await employeeUseCases(orm).listEmployees(OWNER, {});
  const avery = edges.find(({ node }) => node.email === "avery@example.com")!.node;
  expect(avery.userId).toBe("setup-owner");
  const otherIds = edges.filter(({ node }) => node.id !== avery.id).map(({ node }) => node.id);
  expect(invites.map(({ employeeId }) => employeeId).sort()).toEqual(otherIds.sort());
  const service = employeeInviteService(orm);
  for (const invite of invites) {
    const token = new URL(invite.link!).hash.slice(1);
    expect(await service.lookUp(token)).toMatchObject({ inviterFirstName: "Avery" });
  }
});
