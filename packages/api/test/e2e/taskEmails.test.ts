import { onTestFinished } from "vitest";

import {
  ADMIN,
  approveReviewedImport,
  calendarDate,
  createBrowser,
  createJobRunner,
  expect,
  MANAGED_ASSIGNMENT,
  notificationFlow,
  signInAsManagedOwner,
  startFakeMailRelay,
  startManagedEnv,
  test,
  TEST_OWNER,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("a manager and starter receive distinct task emails and the manager can open their task", async () => {
  const relay = await startFakeMailRelay();
  onTestFinished(() => relay.stop());
  const { env, accounts } = await startManagedEnv({ mailRelayUrl: relay.url });
  const owner = await signInAsManagedOwner(env, accounts);
  expect(await (await approveReviewedImport(owner)).json()).toMatchObject({
    data: { imports: { approve: { error: null } } },
  });
  const credentials = { email: "manager@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  const manager = await env.seed.employee({ userId: user.id, email: credentials.email });
  const starterUser = await env.seed.user({ email: "ada@example.com" });
  const starter = await env.seed.employee({
    firstName: "Ada",
    userId: starterUser.id,
    email: starterUser.email,
  });
  await env.seed.manager(starter.id, manager.id);
  const logger = createLogger("silent");
  const db = connectDatabase(env.db.url, logger);
  onTestFinished(() => db.close());
  const jobs = createJobRunner(env.db.url, logger);
  onTestFinished(() => jobs.stop());
  await jobs.start([]);
  const flow = notificationFlow(db.orm, {
    today: () => calendarDate("2026-11-12"),
    jobs: jobs.queue,
  });
  await flow.processes.turnOn(ADMIN, "notifications.task_created");

  // Processes have no HTTP start operation yet; the running server consumes these real jobs.
  const started = await flow.processes.startRun(ADMIN, {
    processKey: "welcome_new_starter",
    recordId: starter.id,
  });

  await expect.poll(() => relay.emails.length, { timeout: 15_000 }).toBe(2);
  const managerEmail = relay.emails.find(({ body }) => body.to === manager.email)!.body;
  const starterEmail = relay.emails.find(({ body }) => body.to === starter.email)!.body;
  expect(managerEmail.idempotencyKey).not.toBe(starterEmail.idempotencyKey);
  const step = started.steps.find((step) => step.task?.assigneeEmployeeId === manager.id)!;
  const task = step.task!;
  expect(managerEmail.blocks).toContainEqual(
    expect.objectContaining({
      type: "button",
      label: "Open task",
      link: `${MANAGED_ASSIGNMENT.publicOrigin}/tasks/${task.id}`,
    }),
  );
  const browser = createBrowser(env.url, MANAGED_ASSIGNMENT.publicOrigin);
  expect((await browser.post("/api/auth/sign-in/email", credentials)).status).toBe(200);
  const response = await browser.graphql("query Task($id: ID!) { task(id: $id) { id title } }", {
    id: task.id,
  });
  expect(await response.json()).toEqual({ data: { task: { id: task.id, title: step.title } } });
});
