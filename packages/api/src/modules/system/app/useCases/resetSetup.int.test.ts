import {
  companyUseCases,
  createEmployeeUseCases,
  expect,
  NON_OWNER,
  PNG,
  storedFileIds,
  systemUseCases,
  test,
  TEST_OWNER,
} from "#test/support";

import { readInstance, readOwner } from "../../../../core/instance";

test("resetting a finished setup deletes every employee and avatar and keeps the company, AI choice and owner", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner({ password: TEST_OWNER.password });
  const company = companyUseCases(orm);
  await company.update(owner, { name: "Acme Corp" });
  await seed.aiSource("broccoli_ai");
  await seed.setupStep("done");
  const firstAvatar = await seed.file({ content: PNG, mimeType: "image/png" });
  const secondAvatar = await seed.file({ content: PNG, mimeType: "image/png" });
  await seed.employee({ avatarFileId: firstAvatar });
  await seed.employee({ avatarFileId: secondAvatar });
  await seed.employee();
  const originalOwner = await readOwner(orm);

  await systemUseCases(orm).resetSetup(owner);

  expect((await createEmployeeUseCases({ orm }).listEmployees(owner, {})).edges).toEqual([]);
  expect(await storedFileIds(orm)).toEqual([]);
  expect(await readInstance(orm)).toMatchObject({
    step: "company",
    aiSource: "broccoli_ai",
    ownerUserId: owner.user!.userId,
  });
  expect(await readOwner(orm)).toEqual(originalOwner);
  expect(await company.getCompany(owner)).toMatchObject({ name: "Acme Corp" });
});

test("refuses a non-owner resetting setup", async ({ orm, seed }) => {
  await seed.owner();
  await seed.setupStep("done");

  await expect(systemUseCases(orm).resetSetup(NON_OWNER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect((await readInstance(orm)).step).toBe("done");
});

test("refuses resetting before setup is done and keeps the employees", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const employee = await seed.employee();

  await expect(systemUseCases(orm).resetSetup(owner)).rejects.toMatchObject({
    code: "CONFLICT",
    message: "Setup is not done.",
  });

  expect((await readInstance(orm)).step).toBe("import");
  const { edges } = await createEmployeeUseCases({ orm }).listEmployees(owner, {});
  expect(edges.map(({ node }) => node)).toEqual([employee]);
});

test("refuses resetting the self-hosted demo and keeps its owner and employees", async ({
  orm,
  seed,
}) => {
  const demoExpiresAt = new Date("2099-10-20T12:00:00Z");
  const owner = await seed.demoOwner({ expiresAt: demoExpiresAt });
  const avatarFileId = await seed.file({ content: PNG, mimeType: "image/png" });
  const employee = await seed.employee({ avatarFileId });

  await expect(systemUseCases(orm).resetSetup(owner)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Exit the demo instead.",
  });

  expect(await readInstance(orm)).toMatchObject({
    step: "done",
    ownerUserId: owner.user!.userId,
    demoExpiresAt,
  });
  const { edges } = await createEmployeeUseCases({ orm }).listEmployees(owner, {});
  expect(edges.map(({ node }) => node)).toEqual([employee]);
  expect(await storedFileIds(orm)).toEqual([avatarFileId]);
});

test("refuses a concurrent second reset", async ({ orm, seed }) => {
  await seed.assignment();
  const owner = await seed.owner();
  await seed.setupStep("done");
  await seed.employee();
  const system = systemUseCases(orm);

  const results = await Promise.allSettled([system.resetSetup(owner), system.resetSetup(owner)]);

  expect(results.filter(({ status }) => status === "fulfilled")).toEqual([
    { status: "fulfilled", value: undefined },
  ]);
  expect(results.filter(({ status }) => status === "rejected")).toMatchObject([
    { reason: { code: "CONFLICT", message: "Setup is not done." } },
  ]);
  expect((await readInstance(orm)).step).toBe("company");
  expect((await createEmployeeUseCases({ orm }).listEmployees(owner, {})).edges).toEqual([]);
});
