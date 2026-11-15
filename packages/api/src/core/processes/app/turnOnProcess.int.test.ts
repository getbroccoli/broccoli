import { ADMIN, EMPLOYEE, calendarDate, expect, processService, test } from "#test/support";

import { WELCOME_NEW_STARTER } from "../domain";

test("lists the seeded welcome process with automatic starts off", async ({ orm }) => {
  const processes = await processService(orm).listProcesses(ADMIN);

  expect(processes).toMatchObject([
    {
      key: WELCOME_NEW_STARTER,
      name: "Welcome a new starter",
      isOn: false,
      turnedOnAt: null,
      activeVersion: { version: 1 },
    },
  ]);
});

test("records turning on and off with the change author", async ({ orm }) => {
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  const on = await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  const off = await processes.turnOff(ADMIN, WELCOME_NEW_STARTER);
  const history = await processes.readProcessHistory(ADMIN, WELCOME_NEW_STARTER, {});

  expect(on).toMatchObject({ isOn: true, turnedOnAt: expect.any(Date) as unknown });
  expect(off).toMatchObject({ isOn: false, turnedOnAt: null });
  expect(
    history.edges.map(({ node }) => ({ operation: node.operation, author: node.author })),
  ).toEqual([
    { operation: "UPDATED", author: { kind: "SIGNED_IN_USER", id: ADMIN.user!.userId } },
    { operation: "UPDATED", author: { kind: "SIGNED_IN_USER", id: ADMIN.user!.userId } },
  ]);
});

test("turning on twice preserves the original activation", async ({ orm }) => {
  let today = calendarDate("2026-12-03");
  const processes = processService(orm, { today: () => today });
  const first = await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  today = calendarDate("2026-12-04");

  const second = await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);

  expect(second).toEqual(first);
  expect((await processes.readProcessHistory(ADMIN, WELCOME_NEW_STARTER, {})).edges).toHaveLength(
    1,
  );
});

test("turning off twice makes no second change", async ({ orm }) => {
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });
  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);
  const first = await processes.turnOff(ADMIN, WELCOME_NEW_STARTER);

  expect(await processes.turnOff(ADMIN, WELCOME_NEW_STARTER)).toEqual(first);
  expect((await processes.readProcessHistory(ADMIN, WELCOME_NEW_STARTER, {})).edges).toHaveLength(
    2,
  );
});

test("an employee cannot turn processes on or off or read their history", async ({ orm }) => {
  const processes = processService(orm);

  await expect(processes.turnOn(EMPLOYEE, WELCOME_NEW_STARTER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(processes.turnOff(EMPLOYEE, WELCOME_NEW_STARTER)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  await expect(
    processes.readProcessHistory(EMPLOYEE, WELCOME_NEW_STARTER, {}),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(processes.listProcesses(EMPLOYEE)).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("turning on starts today's welcome but excludes yesterday's starter", async ({
  orm,
  seed,
}) => {
  const starter = await seed.employee({ startDate: "2026-12-03" });
  await seed.employee({ startDate: "2026-12-02" });
  const processes = processService(orm, { today: () => calendarDate("2026-12-03") });

  await processes.turnOn(ADMIN, WELCOME_NEW_STARTER);

  expect(await processes.listRuns(ADMIN, WELCOME_NEW_STARTER)).toMatchObject([
    { subjectEmployeeId: starter.id, startCause: "started_on_record_date", startDay: "2026-12-03" },
  ]);
});

test("reports an unknown process key", async ({ orm }) => {
  await expect(processService(orm).turnOn(ADMIN, "missing_process")).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "No process has this key.",
  });
});
