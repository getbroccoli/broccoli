import {
  companyUseCases,
  employeeInviteService,
  expect,
  fakeMail,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

import { MailRefusedError } from "../../../../integrations/mail";

test("queues one encrypted email job per invite without returning links", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.mailSettings();
  const people = await seed.employees(2);
  const service = employeeInviteService(orm);

  const sent = await service.send(
    owner,
    { employeeIds: people.map(({ id }) => id) },
    "https://copy.example.com",
  );

  expect(sent).toHaveLength(2);
  expect(sent).toMatchObject([
    { delivery: "sent_by_email", link: null },
    { delivery: "sent_by_email", link: null },
  ]);
  expect(service.sentJobs).toHaveLength(2);
  for (const job of service.sentJobs) {
    expect(job.name).toBe("employees.sendInvite");
    expect(job.payload.inviteId).toEqual(expect.any(String));
    const token = TEST_SECRET_BOX.decrypt(job.payload.encryptedToken);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(job.payload)).not.toContain(token);
  }
});

test("emails the invite with the saved origin, names, note and expiry", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await companyUseCases(orm).update(owner, { name: "Acme Corp" });
  await seed.mailSettings({ linkOrigin: "https://saved.example.com" });
  const employee = await seed.employee({ firstName: "Avery", email: "avery@example.com" });
  const mail = fakeMail();
  const service = employeeInviteService(orm, { mail });
  const [sent] = await service.send(
    owner,
    { employeeIds: [employee.id], note: "Welcome to the team" },
    "https://copy.example.com",
  );
  const job = service.sentJobs[0]!;
  const token = TEST_SECRET_BOX.decrypt(job.payload.encryptedToken);

  await service.jobs["employees.sendInvite"]!.run(job.payload);

  expect(mail.messages).toHaveLength(1);
  expect(mail.messages[0]).toMatchObject({
    template: { name: "invite" },
    to: "avery@example.com",
    fromName: "User via Acme Corp",
    values: {
      firstName: "Avery",
      inviterName: "User",
      companyName: "Acme Corp",
      note: "Welcome to the team",
      link: `https://saved.example.com/invite#${token}`,
      expiresAt: sent!.expiresAt,
    },
  });
  const message = mail.messages[0]!;
  expect(message.replyTo).toBeUndefined();
  expect(message.template.render(message.values).text).toContain("Questions? Ask User directly.");
});

test("marks an invite not sent when the mail provider refuses it permanently", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await seed.mailSettings();
  const employee = await seed.employee();
  const mail = fakeMail();
  mail.sendError = new MailRefusedError("Mail refused", false);
  const service = employeeInviteService(orm, { mail });
  await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com");

  await service.jobs["employees.sendInvite"]!.run(service.sentJobs[0]!.payload);

  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toMatchObject({
    state: "pending",
    notSent: true,
  });
  expect(mail.messages).toEqual([]);
});

test("marks an invite not sent when mail is turned off before its job runs", async ({
  orm,
  seed,
}) => {
  const owner = await seed.owner();
  await seed.mailSettings();
  const employee = await seed.employee();
  const mail = fakeMail();
  const service = employeeInviteService(orm, { mail });
  await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com");
  await seed.mailSettings({ source: "no_email" });

  await service.jobs["employees.sendInvite"]!.run(service.sentJobs[0]!.payload);

  expect((await service.readStatuses(owner, [employee.id])).get(employee.id)).toMatchObject({
    state: "pending",
    notSent: true,
  });
  expect(mail.messages).toEqual([]);
});

test("offers copied links while no mail is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner();

  expect(await employeeInviteService(orm).delivery(owner)).toBe("copied_by_owner");
});

test("offers email delivery while mail is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner();
  await seed.mailSettings();

  expect(await employeeInviteService(orm).delivery(owner)).toBe("sent_by_email");
});
