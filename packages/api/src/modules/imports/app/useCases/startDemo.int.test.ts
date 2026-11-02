import {
  employeeUseCases,
  expect,
  importUseCases,
  OWNER,
  SETUP_HOLDER,
  fakeSlackApi,
  storedFileIds,
  test,
} from "#test/support";

import { createInstanceService } from "../../../../core/instance";
import type { Orm, Tx } from "../../../../core/db";

import { createImportDemoService } from "./importDemoService";

const instances = createInstanceService();

test("starting the demo completes setup", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const imports = importUseCases(orm);

  await imports.startDemo(owner);

  expect((await instances.readInstance(orm)).step).toBe("done");
});

test("the prepared demo start completes setup and fills the demo company in the caller's transaction", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const filledIn: Tx[] = [];
  const startDemo = await createImportDemoService({
    transact,
    prepareDemoFill: () =>
      Promise.resolve((tx: Tx) => {
        filledIn.push(tx);
        return Promise.resolve();
      }),
  }).prepareDemoStart();

  await transact(async (tx) => {
    await startDemo(owner, tx);
    expect(filledIn).toEqual([tx]);
  });

  expect((await instances.readInstance(orm)).step).toBe("done");
});

test.for(["owner", "company", "done"] as const)(
  "starting the demo does nothing at the %s step",
  async (step, { orm, seed }) => {
    const owner = await seed.owner();
    await seed.setupStep(step);
    const imports = importUseCases(orm);

    await imports.startDemo(owner);

    expect((await instances.readInstance(orm)).step).toBe(step);
    expect(await hasEmployees(orm)).toBe(false);
  },
);

test("the setup holder starts the demo without an owner and moves setup to owner", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm);

  await imports.startDemo(SETUP_HOLDER);

  expect((await instances.readInstance(orm)).step).toBe("owner");
});

test("starting the demo fills the demo company before an owner exists", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm);

  await imports.startDemo(SETUP_HOLDER);

  expect(await hasEmployees(orm)).toBe(true);
});

test("keeps setup at import when the demo fill fails", async ({ orm, seed }) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm, {
    prepareDemoFill: () => Promise.resolve(() => Promise.reject(new Error("fill failed"))),
  });

  await expect(imports.startDemo(SETUP_HOLDER)).rejects.toThrow("fill failed");

  expect((await instances.readInstance(orm)).step).toBe("import");
  expect(await hasEmployees(orm)).toBe(false);
});

test("starting the demo after a Slack read discards the import and its files", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  await seed.slackConnection();
  const imports = importUseCases(orm, { slackApi: fakeSlackApi() });
  await imports.readSlack(SETUP_HOLDER);
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const importFiles = await storedFileIds(orm);
  expect(importFiles).toHaveLength(2);

  await imports.startDemo(SETUP_HOLDER);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
  const employees = await employeeUseCases(orm).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node.email)).not.toContain("avery@example.com");
  const remainingFiles = await storedFileIds(orm);
  expect(remainingFiles.filter((id) => importFiles.includes(id))).toEqual([]);
  expect(remainingFiles).toEqual(employees.edges.map(({ node }) => node.avatarFileId).sort());
});

test("gives the demo company's employees managers", async ({ orm, seed }) => {
  await seed.setupStep("import");

  await importUseCases(orm).startDemo(SETUP_HOLDER);

  const employees = employeeUseCases(orm);
  const { edges } = await employees.listEmployees(OWNER, { first: 100 });
  const people = edges.map(({ node }) => node);
  const managers = await employees.readManagers(
    OWNER,
    people.map(({ id }) => id),
  );
  const ceo = people.find(({ jobTitle }) => jobTitle === "CEO")!;
  expect(people).toHaveLength(40);
  expect(managers.get(ceo.id) ?? null).toBeNull();
  expect(
    people
      .filter(({ id }) => id !== ceo.id)
      .every(({ id }) => {
        const manager = managers.get(id);
        return (
          manager != null && manager.id !== id && people.some((person) => person.id === manager.id)
        );
      }),
  ).toBe(true);
});

async function hasEmployees(orm: Orm): Promise<boolean> {
  const { edges } = await employeeUseCases(orm).listEmployees(OWNER, { first: 1 });
  return edges.length > 0;
}
