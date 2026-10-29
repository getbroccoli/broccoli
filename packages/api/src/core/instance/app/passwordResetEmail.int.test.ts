import {
  expect,
  fakeMail,
  MANAGED_INSTANCE_CREDENTIAL,
  EMPLOYEE,
  passwordResetEmail,
  SYSTEM,
  test,
  TEST_OWNER,
  TEST_SECRET_BOX,
} from "#test/support";

test("emails a reset link at the saved origin to a user with a password", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings({ linkOrigin: "https://saved.example.com" });
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });

  await reset.queue(SYSTEM, { id: owner.user!.userId }, "reset-token");
  expect(reset.sentJobs).toHaveLength(1);
  await reset.jobs["instance.sendPasswordResetEmail"]!.run(reset.sentJobs[0]!.payload);

  expect(mail.messages).toMatchObject([
    {
      template: { name: "password_reset" },
      values: { resetLink: "https://saved.example.com/reset-password#reset-token" },
      to: TEST_OWNER.email,
      fromName: "Broccoli",
    },
  ]);
});

test("a managed reset is sent through the relay for a person with a password", async ({
  orm,
  seed,
}) => {
  await seed.assignment({ instanceCredential: MANAGED_INSTANCE_CREDENTIAL });
  const user = await seed.user({ email: "avery@example.com", password: TEST_OWNER.password });
  await seed.employee({ email: user.email, userId: user.id });
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mode: "managed", mail });

  await reset.queue(SYSTEM, { id: user.id }, "reset-token");
  expect(reset.sentJobs).toHaveLength(1);
  await reset.jobs["instance.sendPasswordResetEmail"]!.run(reset.sentJobs[0]!.payload);

  expect(mail.messages).toMatchObject([
    {
      template: { name: "password_reset" },
      values: { resetLink: "https://broccoli.example.com/reset-password#reset-token" },
      to: user.email,
      fromName: "Broccoli",
    },
  ]);
  expect(mail.relayTransports).toContainEqual({
    url: "http://127.0.0.1:9",
    credential: MANAGED_INSTANCE_CREDENTIAL,
  });
  expect(mail.transports).toEqual([]);
});

test("the managed owner gets no reset email", async ({ orm, seed }) => {
  await seed.assignment({ instanceCredential: MANAGED_INSTANCE_CREDENTIAL });
  const owner = await seed.owner();
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mode: "managed", mail });

  await reset.queue(SYSTEM, { id: owner.user!.userId }, "reset-token");

  expect(reset.sentJobs).toEqual([]);
  expect(mail.messages).toEqual([]);
});

test("queues no reset email for a user without a password", async ({ orm, seed }) => {
  const owner = await seed.demoOwner({ expiresAt: new Date("2099-01-01T00:00:00Z") });
  await seed.mailSettings();
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });

  await reset.queue(SYSTEM, { id: owner.user!.userId }, "reset-token");

  expect(reset.sentJobs).toEqual([]);
  expect(mail.messages).toEqual([]);
});

test("queues no reset email while no email is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });

  await reset.queue(SYSTEM, { id: owner.user!.userId }, "reset-token");

  expect(reset.sentJobs).toEqual([]);
  expect(mail.messages).toEqual([]);
});

test("a queued reset sends nothing once no email is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings();
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });
  await reset.queue(SYSTEM, { id: owner.user!.userId }, "reset-token");
  expect(reset.sentJobs).toHaveLength(1);
  await seed.mailSettings({ source: "no_email" });

  await reset.jobs["instance.sendPasswordResetEmail"]!.run(reset.sentJobs[0]!.payload);

  expect(mail.messages).toEqual([]);
});

test("the queued reset job never holds the token in plain text", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings();
  const reset = passwordResetEmail(orm, { mail: fakeMail() });

  await reset.queue(SYSTEM, { id: owner.user!.userId }, "private-reset-token");

  expect(reset.sentJobs).toMatchObject([
    {
      name: "instance.sendPasswordResetEmail",
      payload: { userId: owner.user!.userId },
    },
  ]);
  expect(JSON.stringify(reset.sentJobs)).not.toContain("private-reset-token");
  expect(TEST_SECRET_BOX.decrypt(reset.sentJobs[0]!.payload.encryptedToken)).toBe(
    "private-reset-token",
  );
});

test("refuses to queue a reset for anyone but the system or an admin", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings();
  const reset = passwordResetEmail(orm, { mail: fakeMail() });

  await expect(
    reset.queue(EMPLOYEE, { id: owner.user!.userId }, "reset-token"),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(reset.sentJobs).toEqual([]);
});
