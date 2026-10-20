import {
  expect,
  importUseCases,
  OWNER,
  SETUP_HOLDER,
  slackPhotoReader,
  storedFileIds,
  test,
} from "#test/support";

import { readSetupStep } from "../../../../core/instance";
import type { Orm, Tx } from "../../../../core/db";
import { createEmployeeUseCases } from "../../../employees";
import { prepareDemoStart } from "./startDemo";

test("starting the demo completes setup", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const imports = importUseCases(orm);

  await imports.startDemo(owner);

  expect(await readSetupStep(orm)).toBe("done");
});

test("the prepared demo start completes setup and fills the demo company in the caller's transaction", async ({
  orm,
  seed,
  transact,
}) => {
  const owner = await seed.owner();
  await seed.setupStep("import");
  const filledIn: Tx[] = [];
  const startDemo = await prepareDemoStart({
    prepareDemoFill: () =>
      Promise.resolve((tx: Tx) => {
        filledIn.push(tx);
        return Promise.resolve();
      }),
  });

  await transact(async (tx) => {
    await startDemo(owner, tx);
    expect(filledIn).toEqual([tx]);
  });

  expect(await readSetupStep(orm)).toBe("done");
});

test.for(["owner", "company", "done"] as const)(
  "starting the demo does nothing at the %s step",
  async (step, { orm, seed }) => {
    const owner = await seed.owner();
    await seed.setupStep(step);
    const imports = importUseCases(orm);

    await imports.startDemo(owner);

    expect(await readSetupStep(orm)).toBe(step);
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

  expect(await readSetupStep(orm)).toBe("owner");
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

  expect(await readSetupStep(orm)).toBe("import");
  expect(await hasEmployees(orm)).toBe(false);
});

test("starting the demo after a Slack read discards the import and its files", async ({
  orm,
  seed,
}) => {
  await seed.setupStep("import");
  const imports = importUseCases(orm, { slack: slackPhotoReader() });
  await imports.readSlack(SETUP_HOLDER);
  await seed.fileSource({ content: "Name\nAvery Stone", status: "mapped" });
  const importFiles = await storedFileIds(orm);
  expect(importFiles).toHaveLength(2);

  await imports.startDemo(SETUP_HOLDER);

  expect(await imports.reads.listSources(SETUP_HOLDER)).toEqual([]);
  expect((await imports.reads.readReview(SETUP_HOLDER)).listEmployees({}).edges).toEqual([]);
  const employees = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 100 });
  expect(employees.edges.map(({ node }) => node.email)).not.toContain("avery@example.com");
  const remainingFiles = await storedFileIds(orm);
  expect(remainingFiles.filter((id) => importFiles.includes(id))).toEqual([]);
  expect(remainingFiles).toEqual(employees.edges.map(({ node }) => node.avatarFileId).sort());
});

async function hasEmployees(orm: Orm): Promise<boolean> {
  const { edges } = await createEmployeeUseCases({ orm }).listEmployees(OWNER, { first: 1 });
  return edges.length > 0;
}
