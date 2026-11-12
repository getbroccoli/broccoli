import { afterEach, beforeEach, vi } from "vitest";

import { ADMIN, agentConnectionService, expect, OWNER, SYSTEM, test } from "#test/support";

test("disconnect ends the caller's connection and refuses its next use", async ({ orm, seed }) => {
  const connectedAt = new Date("2026-11-11T12:00:00Z");
  const { clientId, connectionId } = await seed.agentConnection({
    userId: OWNER.user!.userId,
    clientName: "Claude Code",
    connectedAt,
  });
  const service = agentConnectionService(orm);

  const ended = await service.disconnectMyAgent(OWNER);

  expect(ended).toEqual({
    id: connectionId,
    clientId,
    clientName: "Claude Code",
    connectedAt,
    endedAt: new Date("2026-11-12T12:00:00Z"),
    reason: "disconnected_by_person",
  });
  expect(await service.readMyAgentConnection(OWNER)).toBeNull();
  expect(
    await service.useAgentConnection(SYSTEM, { userId: OWNER.user!.userId, clientId }),
  ).toBeNull();
});

test("disconnect and the last ending name the same connection when several end at once", async ({
  orm,
  seed,
}) => {
  await seed.agentConnection({
    userId: OWNER.user!.userId,
    connectedAt: new Date("2026-11-10T12:00:00Z"),
  });
  const { connectionId } = await seed.agentConnection({
    userId: OWNER.user!.userId,
    connectedAt: new Date("2026-11-11T12:00:00Z"),
  });
  const service = agentConnectionService(orm);

  const ended = await service.disconnectMyAgent(OWNER);

  expect(ended).toMatchObject({ id: connectionId });
  expect(await service.readMyLastEndedConnection(OWNER)).toMatchObject({ id: connectionId });
});

test("disconnect and the last ending name the same connection when several connected at the same moment", async ({
  orm,
  seed,
}) => {
  const connectedAt = new Date("2026-11-11T12:00:00Z");
  await seed.agentConnection({ userId: OWNER.user!.userId, connectedAt });
  await seed.agentConnection({ userId: OWNER.user!.userId, connectedAt });
  const service = agentConnectionService(orm);

  const ended = await service.disconnectMyAgent(OWNER);

  expect(ended).not.toBeNull();
  expect(await service.readMyLastEndedConnection(OWNER)).toMatchObject({ id: ended!.id });
});

test("disconnect without a connection returns null", async ({ orm }) => {
  const ended = await agentConnectionService(orm).disconnectMyAgent(OWNER);

  expect(ended).toBeNull();
});

test("disconnect leaves another person's connection connected", async ({ orm, seed }) => {
  await seed.agentConnection({ userId: OWNER.user!.userId });
  const { connectionId } = await seed.agentConnection({ userId: ADMIN.user!.userId });
  const service = agentConnectionService(orm);

  await service.disconnectMyAgent(OWNER);

  expect(await service.readMyAgentConnection(ADMIN)).toMatchObject({ id: connectionId });
});

test("disconnect refuses a caller without a user", async ({ orm }) => {
  await expect(agentConnectionService(orm).disconnectMyAgent(SYSTEM)).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});

test("a password reset records why the connection ended and its client name", async ({
  orm,
  seed,
}) => {
  const { connectionId } = await seed.agentConnection({
    userId: OWNER.user!.userId,
    clientName: "Claude Code",
  });
  const service = agentConnectionService(orm);

  await service.endConnections(SYSTEM, {
    userId: OWNER.user!.userId,
    reason: "ended_by_password_reset",
  });

  expect(await service.readMyLastEndedConnection(OWNER)).toMatchObject({
    id: connectionId,
    clientName: "Claude Code",
    reason: "ended_by_password_reset",
  });
});

test("allowing another agent records the first connection as replaced", async ({ orm, seed }) => {
  const first = await seed.agentConnection({ userId: OWNER.user!.userId });
  const second = await seed.agentConnection({ userId: OWNER.user!.userId });
  const service = agentConnectionService(orm);

  await service.keepOnlyConnection(SYSTEM, {
    userId: OWNER.user!.userId,
    clientId: second.clientId,
  });

  expect(await service.readMyLastEndedConnection(OWNER)).toMatchObject({
    id: first.connectionId,
    reason: "replaced_by_another_agent",
  });
});

test("the last ending is the most recent of several", async ({ orm, seed }) => {
  await seed.agentConnection({ userId: OWNER.user!.userId });
  const service = agentConnectionService(orm);
  await service.disconnectMyAgent(OWNER);
  vi.setSystemTime(new Date("2026-11-13T12:00:00Z"));
  const { connectionId } = await seed.agentConnection({ userId: OWNER.user!.userId });
  await service.endConnections(SYSTEM, {
    userId: OWNER.user!.userId,
    reason: "ended_by_password_reset",
  });

  const ended = await service.readMyLastEndedConnection(OWNER);

  expect(ended).toMatchObject({
    id: connectionId,
    endedAt: new Date("2026-11-13T12:00:00Z"),
    reason: "ended_by_password_reset",
  });
});

test("a person reads only their own ending", async ({ orm, seed }) => {
  const { connectionId } = await seed.agentConnection({ userId: ADMIN.user!.userId });
  const service = agentConnectionService(orm);
  await service.disconnectMyAgent(ADMIN);

  expect(await service.readMyLastEndedConnection(OWNER)).toBeNull();
  expect(await service.readMyLastEndedConnection(ADMIN)).toMatchObject({ id: connectionId });
});

test("using a connection unused for 31 days records why it ended", async ({ orm, seed }) => {
  const { clientId, connectionId } = await seed.agentConnection({
    userId: OWNER.user!.userId,
    connectedAt: new Date("2026-10-12T12:00:00Z"),
  });
  const service = agentConnectionService(orm);

  const connected = await service.useAgentConnection(SYSTEM, {
    userId: OWNER.user!.userId,
    clientId,
  });

  expect(connected).toBeNull();
  expect(await service.readMyLastEndedConnection(OWNER)).toMatchObject({
    id: connectionId,
    reason: "ended_after_30_days_unused",
  });
});

test("the current connection includes when the agent last used it", async ({ orm, seed }) => {
  const { clientId } = await seed.agentConnection({
    userId: OWNER.user!.userId,
    connectedAt: new Date("2026-11-11T12:00:00Z"),
  });
  const service = agentConnectionService(orm);
  await service.useAgentConnection(SYSTEM, { userId: OWNER.user!.userId, clientId });

  const connection = await service.readMyAgentConnection(OWNER);

  expect(connection?.lastUsedAt).toEqual(new Date("2026-11-12T12:00:00Z"));
});

test("a person's invitation is not closed before they close it", async ({ orm }) => {
  const closed = await agentConnectionService(orm).isInvitationClosed(OWNER);

  expect(closed).toBe(false);
});

test("closing the invitation keeps it closed, also when closed twice", async ({ orm, seed }) => {
  await seed.agentConnection({ userId: OWNER.user!.userId });
  const service = agentConnectionService(orm);

  await service.closeInvitation(OWNER);

  expect(await service.isInvitationClosed(OWNER)).toBe(true);
  await service.closeInvitation(OWNER);
  expect(await service.isInvitationClosed(OWNER)).toBe(true);
});

test("closing leaves another person's invitation open", async ({ orm, seed }) => {
  await seed.agentConnection({ userId: OWNER.user!.userId });
  await seed.agentConnection({ userId: ADMIN.user!.userId });
  const service = agentConnectionService(orm);

  await service.closeInvitation(OWNER);

  expect(await service.isInvitationClosed(ADMIN)).toBe(false);
});

test("closing the invitation refuses a caller without a user", async ({ orm }) => {
  await expect(agentConnectionService(orm).closeInvitation(SYSTEM)).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only a signed-in person can close the invitation to connect their agent.",
  });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());
