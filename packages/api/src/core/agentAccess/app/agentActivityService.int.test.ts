import { eq } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";

import {
  ADMIN,
  agentActivityService,
  domainEvents,
  expect,
  OWNER,
  SYSTEM,
  test,
} from "#test/support";
import { user } from "../../auth";

test("a person lists their recorded call with its agent's name, tool, outcome, count and time", async ({
  orm,
  seed,
}) => {
  const { clientId } = await seed.agentConnection({ userId: OWNER.user!.userId });
  const service = agentActivityService(orm);
  const call = {
    clientId,
    tool: "find_people",
    outcome: "answered_by_broccoli" as const,
    resultCount: 2,
  };

  await service.recordCall(OWNER, call);

  const activity = await service.listMyActivity(OWNER, {});
  expect(activity.edges.map(({ node }) => node)).toEqual([
    {
      ...call,
      clientName: "Claude Code",
      id: expect.any(String) as unknown,
      calledAt: new Date("2026-11-12T12:00:00Z"),
    },
  ]);
});

test("each line names the agent that made the call", async ({ orm, seed }) => {
  const claude = await seed.agentConnection({
    userId: OWNER.user!.userId,
    clientName: "Claude Code",
  });
  const codex = await seed.agentConnection({
    userId: OWNER.user!.userId,
    clientName: "Codex",
  });
  const service = agentActivityService(orm);
  await service.recordCall(OWNER, answeredCall(claude.clientId));
  await service.recordCall(OWNER, answeredCall(codex.clientId));

  const activity = await service.listMyActivity(OWNER, {});

  expect(activity.edges.map(({ node }) => node)).toMatchObject([
    { clientId: codex.clientId, clientName: "Codex" },
    { clientId: claude.clientId, clientName: "Claude Code" },
  ]);
});

test("a line of an agent that gave no name has no agent name", async ({ orm, seed }) => {
  const { clientId } = await seed.agentConnection({
    userId: OWNER.user!.userId,
    clientName: null,
  });
  const service = agentActivityService(orm);
  await service.recordCall(OWNER, answeredCall(clientId));

  const activity = await service.listMyActivity(OWNER, {});

  expect(activity.edges.map(({ node }) => node.clientName)).toEqual([null]);
});

test("activity is paged newest first", async ({ orm, seed }) => {
  const { clientId } = await seed.agentConnection({ userId: OWNER.user!.userId });
  const service = agentActivityService(orm);
  const call = answeredCall(clientId);
  await service.recordCall(OWNER, call);
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  await service.recordCall(OWNER, call);
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  await service.recordCall(OWNER, call);

  const first = await service.listMyActivity(OWNER, { first: 2 });

  expect(first.edges.map(({ node }) => node.calledAt)).toEqual([
    new Date("2026-11-14T12:00:00Z"),
    new Date("2026-11-13T12:00:00Z"),
  ]);
  expect(first.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: expect.any(String) as unknown,
  });
  const next = await service.listMyActivity(OWNER, { first: 2, after: first.pageInfo.endCursor });
  expect(next.edges.map(({ node }) => node.calledAt)).toEqual([new Date("2026-11-12T12:00:00Z")]);
  expect(next.pageInfo.hasNextPage).toBe(false);
});

test("a person never lists another person's activity", async ({ orm, seed }) => {
  const owner = await seed.agentConnection({ userId: OWNER.user!.userId });
  const admin = await seed.agentConnection({ userId: ADMIN.user!.userId });
  const service = agentActivityService(orm);
  await service.recordCall(OWNER, answeredCall(owner.clientId));
  await service.recordCall(ADMIN, answeredCall(admin.clientId));

  const activity = await service.listMyActivity(OWNER, {});

  expect(activity.edges.map(({ node }) => node.clientId)).toEqual([owner.clientId]);
});

test("recording a call publishes one activity event for the person", async ({ orm, seed }) => {
  const userId = OWNER.user!.userId;
  const { clientId } = await seed.agentConnection({ userId });
  const { transact, events } = domainEvents(orm);

  await agentActivityService(orm, { transact }).recordCall(OWNER, answeredCall(clientId));

  expect(events).toEqual([{ type: "agentAccess.activity_recorded", payload: { userId } }]);
});

test("deleting old activity removes calls older than 30 days and keeps newer calls", async ({
  orm,
  seed,
}) => {
  const { clientId } = await seed.agentConnection({ userId: OWNER.user!.userId });
  const service = agentActivityService(orm);
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  await service.recordCall(OWNER, answeredCall(clientId));
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  await service.recordCall(OWNER, answeredCall(clientId));
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
  expect((await service.listMyActivity(OWNER, {})).edges).toHaveLength(2);

  await service.deleteOldActivity(SYSTEM);

  const activity = await service.listMyActivity(OWNER, {});
  expect(activity.edges.map(({ node }) => node.calledAt)).toEqual([
    new Date("2026-10-14T12:00:00Z"),
  ]);
});

test("deleting a person's user deletes their agent activity", async ({ orm, seed }) => {
  const userId = OWNER.user!.userId;
  const { clientId } = await seed.agentConnection({ userId });
  const service = agentActivityService(orm);
  await service.recordCall(OWNER, answeredCall(clientId));
  expect((await service.listMyActivity(OWNER, {})).edges).toHaveLength(1);

  await orm.delete(user).where(eq(user.id, userId));

  expect((await service.listMyActivity(OWNER, {})).edges).toEqual([]);
});

test("recording a call that cannot be saved does not throw", async ({ orm }) => {
  const service = agentActivityService(orm);

  await expect(service.recordCall(OWNER, answeredCall("test-client"))).resolves.toBeUndefined();
});

function answeredCall(clientId: string) {
  return {
    clientId,
    tool: "who_am_i",
    outcome: "answered_by_broccoli" as const,
    resultCount: null,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());
