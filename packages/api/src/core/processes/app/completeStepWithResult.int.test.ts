import {
  ADMIN,
  calendarDate,
  employeeServices,
  expect,
  processService,
  seedProcess,
  signedIn,
  taskService,
  test,
  transactWithProcesses,
  type TaskStepsDefinition,
} from "#test/support";

test("copies the step form onto its task and completes the step with the task result", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const definition = checkDefinition();
  const { key } = await seedProcess(orm, { key: "check_accounts", definition });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const taskId = started.steps[0]!.task!.id;
  expect((await tasks.readTask(ctx, taskId)).resultForm).toEqual(
    definition.steps[0]!.task.resultForm,
  );
  const result = { code: "no", comment: "VPN login fails" };

  await tasks.markDone(ctx, taskId, { result });

  const completed = await processes.readRun(ADMIN, started.run.id);
  expect(completed.run.status).toBe("finished");
  expect(completed.steps).toMatchObject([
    { key: "check", status: "step_completed", result, task: { status: "done" } },
  ]);
});

test("keeps a completed step's result after its assignee and task are removed", async ({
  orm,
  seed,
}) => {
  const manager = await seed.employee();
  const employee = await seed.employee();
  await seed.manager(employee.id, manager.id);
  const ctx = signedIn(orm, { employeeId: manager.id, profiles: ["EMPLOYEE"] });
  const { key } = await seedProcess(orm, { key: "check_accounts", definition: checkDefinition() });
  const transact = transactWithProcesses(orm, { today });
  const processes = processService(orm, { today, transact });
  const tasks = taskService(orm, { transact });
  const started = await processes.startRun(ADMIN, { processKey: key, recordId: employee.id });
  const result = { code: "no", comment: "VPN login fails" };
  await tasks.markDone(ctx, started.steps[0]!.task!.id, { result });

  await employeeServices(orm).deleteEmployee(ADMIN, { id: manager.id });

  const completed = await processes.readRun(ADMIN, started.run.id);
  expect(completed.steps).toMatchObject([
    { key: "check", status: "step_completed", result, task: null },
  ]);
});

function checkDefinition(): TaskStepsDefinition {
  return {
    subject: { recordType: "employee" },
    trigger: {
      kind: "on_record_date",
      recordType: "employee",
      dateField: "startDate",
      offset: { amount: 0, unit: "calendar_days" },
      maxDaysLate: 7,
    },
    steps: [
      {
        key: "check",
        kind: "task",
        after: [],
        task: {
          assignee: { kind: "subjects_manager" },
          title: "Check accounts",
          description: null,
          due: { amount: 0, unit: "calendar_days" },
          resultForm: {
            kind: "choice",
            display: "buttons",
            options: [
              { code: "yes", label: "Yes", commentRequired: false },
              { code: "no", label: "No", commentRequired: true },
            ],
          },
        },
      },
    ],
  };
}

const today = () => calendarDate("2026-12-03");
