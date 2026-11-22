import { assert } from "vitest";

import {
  ADMIN,
  calendarDate,
  companyService,
  expect,
  MANAGED_INSTANCE_CREDENTIAL,
  notificationFlow,
  seedProcess,
  signedIn,
  SYSTEM,
  taskService,
  test,
  type TestSeed,
} from "#test/support";

import type { Orm } from "../../db";
import { MailRefusedError } from "../../../integrations/mail";

test.for([
  { mode: "self_hosted", fromName: "Sam Lee via Acme Corp" },
  { mode: "managed", fromName: "Sam Lee" },
] as const)(
  "emails the assignee once through $mode mail",
  async ({ mode, fromName }, { orm, seed }) => {
    const { sam, mia, samCtx, input } = await peopleAndTask(orm, seed);
    if (mode === "managed")
      await seed.assignment({ instanceCredential: MANAGED_INSTANCE_CREDENTIAL });
    const flow = notificationFlow(orm, { today, mailSettings: { mode } });
    await flow.processes.turnOn(ADMIN, "notifications.task_created");

    const task = await flow.transact((tx) => taskService(orm).createTask(samCtx, tx, input));
    expect(flow.mail.messages).toEqual([]);
    const sent = await flow.deliver();
    await flow.deliver();

    expect(sent).toMatchObject([
      { recipient: { employeeId: mia.id }, record: { recordType: "task", recordId: task.id } },
    ]);
    expect(flow.mail.messages).toHaveLength(1);
    const message = flow.mail.messages[0]!;
    expect(message).toMatchObject({
      to: mia.email,
      fromName,
      template: { name: "task_assigned" },
      values: { askedByName: `${sam.firstName} ${sam.lastName}`, recipientEmail: mia.email },
      idempotencyKey: sent[0]!.key,
    });
    expect(message.template.render(message.values).blocks).toContainEqual(
      expect.objectContaining({
        type: "button",
        link: `https://broccoli.example.com/tasks/${task.id}`,
      }),
    );
  },
);

test("does not email someone who asks themselves", async ({ orm, seed }) => {
  const { sam, samCtx, input } = await peopleAndTask(orm, seed);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");

  await flow.transact((tx) =>
    taskService(orm).createTask(samCtx, tx, { ...input, assigneeEmployeeId: sam.id }),
  );

  expect(await flow.deliver()).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test("emails the asker once when someone else marks their task done", async ({ orm, seed }) => {
  const { sam, miaCtx, input } = await peopleAndTask(orm, seed);
  const task = await seed.task(input);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_done");

  await taskService(orm, { transact: flow.transact }).markDone(miaCtx, task.id);
  await flow.deliver();
  await flow.deliver();

  expect(flow.mail.messages).toMatchObject([
    {
      to: sam.email,
      fromName: "Mia Chen via Acme Corp",
      template: { name: "task_done" },
      values: { doneByName: "Mia Chen" },
    },
  ]);
});

test("does not email someone who marks their own request done", async ({ orm, seed }) => {
  const { sam, samCtx, input } = await peopleAndTask(orm, seed);
  const task = await seed.task({ ...input, assigneeEmployeeId: sam.id });
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_done");

  await taskService(orm, { transact: flow.transact }).markDone(samCtx, task.id);

  expect(await flow.deliver()).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test("emails a process task's assignee from the company when nobody asked", async ({
  orm,
  seed,
}) => {
  const { mia, input } = await peopleAndTask(orm, seed);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");

  await flow.transact((tx) =>
    taskService(orm).createTask(SYSTEM, tx, {
      ...input,
      type: "process_step_to_do",
      askedByEmployeeId: null,
    }),
  );
  await flow.deliver();

  expect(flow.mail.messages).toMatchObject([
    {
      to: mia.email,
      fromName: "Acme Corp",
      template: { name: "task_assigned" },
      values: { askedByName: null },
    },
  ]);
});

test("emails nobody when a task with no asker is marked done", async ({ orm, seed }) => {
  const { miaCtx, input } = await peopleAndTask(orm, seed);
  const task = await seed.task({ ...input, type: "process_step_to_do", askedByEmployeeId: null });
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_done");

  await taskService(orm, { transact: flow.transact }).markDone(miaCtx, task.id);

  expect(await flow.deliver()).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test("does not email an assignee who has not joined", async ({ orm, seed }) => {
  const { samCtx, input } = await peopleAndTask(orm, seed);
  const invited = await seed.employee();
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");

  await flow.transact((tx) =>
    taskService(orm).createTask(samCtx, tx, { ...input, assigneeEmployeeId: invited.id }),
  );
  await flow.deliver();

  expect(flow.mail.messages).toEqual([]);
});

test("drops a send job when its task was deleted", async ({ orm, seed }) => {
  const { samCtx, input } = await peopleAndTask(orm, seed);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");
  const task = await flow.transact((tx) => taskService(orm).createTask(samCtx, tx, input));
  const start = flow.queuedJobs.shift();
  assert(start?.name === "processes.startRunsAfterCommit");
  await flow.processes.startRunsAfterCommit(SYSTEM, start.payload);
  expect(flow.queuedJobs).toMatchObject([{ name: "notifications.send" }]);

  await taskService(orm).deleteTask(samCtx, task.id);

  expect(await flow.deliver()).toHaveLength(1);
  expect(flow.mail.messages).toEqual([]);
});

test("drops email without a mail choice instead of holding it for later", async ({ orm, seed }) => {
  const { samCtx, input } = await peopleAndTask(orm, seed);
  await seed.mailSettings({ source: "no_email" });
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");
  await flow.transact((tx) => taskService(orm).createTask(samCtx, tx, input));

  expect(await flow.deliver()).toHaveLength(1);
  await seed.mailSettings();
  expect(await flow.deliver()).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test("throws a retryable mail refusal so the queue retries", async ({ orm, seed }) => {
  const { mia, input } = await peopleAndTask(orm, seed);
  const task = await seed.task(input);
  const flow = notificationFlow(orm, { today });
  const payload = sendPayload(task.id, mia.id);
  const refusal = new MailRefusedError("Try later", true);
  flow.mail.sendError = refusal;

  await expect(flow.sendJob.run(payload)).rejects.toBe(refusal);
  expect(flow.mail.messages).toEqual([]);
  flow.mail.sendError = null;
  await flow.sendJob.run(payload);

  expect(flow.mail.messages).toMatchObject([{ to: mia.email, idempotencyKey: payload.key }]);
});

test("drops a permanent mail refusal without queuing another attempt", async ({ orm, seed }) => {
  const { samCtx, input } = await peopleAndTask(orm, seed);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");
  flow.mail.sendError = new MailRefusedError("Mailbox refused", false);
  await flow.transact((tx) => taskService(orm).createTask(samCtx, tx, input));

  expect(await flow.deliver()).toHaveLength(1);
  flow.mail.sendError = null;
  expect(await flow.deliver()).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test("queues no notification for a rolled-back task change", async ({ orm, seed }) => {
  const { samCtx, input } = await peopleAndTask(orm, seed);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");

  await expect(
    flow.transact(async (tx) => {
      await taskService(orm).createTask(samCtx, tx, input);
      throw new Error("Rollback");
    }),
  ).rejects.toThrow("Rollback");

  expect(flow.queuedJobs).toEqual([]);
  expect(await flow.deliver()).toEqual([]);
  expect(await flow.processes.listRuns(ADMIN, "notifications.task_created")).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test("does not notify while the process is turned off", async ({ orm, seed }) => {
  const { samCtx, input } = await peopleAndTask(orm, seed);
  const flow = notificationFlow(orm, { today });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");
  await flow.processes.turnOff(ADMIN, "notifications.task_created");

  await flow.transact((tx) => taskService(orm).createTask(samCtx, tx, input));

  expect(flow.queuedJobs).toEqual([]);
  expect(await flow.deliver()).toEqual([]);
  expect(await flow.processes.listRuns(ADMIN, "notifications.task_created")).toEqual([]);
  expect(flow.mail.messages).toEqual([]);
});

test.for([
  { field: "assignee", emailTemplateKey: "tasks.unknown" },
  { field: "unknown_employee", emailTemplateKey: "tasks.task_assigned" },
])(
  "refuses unregistered notification params: $field, $emailTemplateKey",
  async (params, { orm, seed }) => {
    const { input } = await peopleAndTask(orm, seed);
    const task = await seed.task(input);
    await seedProcess(orm, {
      key: "bad_notification",
      definition: {
        subject: { recordType: "task" },
        trigger: { kind: "on_event", event: "tasks.task_created", run: "after_commit" },
        steps: [
          {
            kind: "action",
            key: "notify",
            action: {
              name: "notifications.notify",
              params: {
                recipient: { kind: "record_employee", field: params.field },
                emailTemplateKey: params.emailTemplateKey,
              },
            },
          },
        ],
      },
    });
    const flow = notificationFlow(orm, { today });

    await expect(
      flow.processes.startRun(ADMIN, { processKey: "bad_notification", recordId: task.id }),
    ).rejects.toThrow(/Step notify has bad params for action notifications\.notify:/);
    expect(flow.mail.messages).toEqual([]);
  },
);

async function peopleAndTask(orm: Orm, seed: TestSeed) {
  await seed.mailSettings();
  await companyService(orm).update(ADMIN, { name: "Acme Corp" });
  const samUser = await seed.user({ email: "sam.personal@example.com" });
  const miaUser = await seed.user({ email: "mia.personal@example.com" });
  const sam = await seed.employee({
    firstName: "Sam",
    lastName: "Lee",
    email: "sam@example.com",
    userId: samUser.id,
  });
  const mia = await seed.employee({
    firstName: "Mia",
    lastName: "Chen",
    email: "mia@example.com",
    userId: miaUser.id,
  });
  return {
    sam,
    mia,
    samCtx: signedIn(orm, { employeeId: sam.id, profiles: ["EMPLOYEE"] }),
    miaCtx: signedIn(orm, { employeeId: mia.id, profiles: ["EMPLOYEE"] }),
    input: {
      type: "manual_to_do",
      title: "Book the team offsite",
      assigneeEmployeeId: mia.id,
      askedByEmployeeId: sam.id,
    },
  };
}

function sendPayload(taskId: string, employeeId: string) {
  return {
    recipient: { employeeId },
    emailTemplateKey: "tasks.task_assigned",
    record: { recordType: "task", recordId: taskId },
    key: "run-1:notify",
  };
}

const today = () => calendarDate("2026-11-12");
