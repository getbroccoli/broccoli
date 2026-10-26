import {
  expect,
  fakeMail,
  passwordResetEmail,
  test,
  TEST_OWNER,
  TEST_SECRET_BOX,
} from "#test/support";

test("emails a reset link at the saved origin to a user with a password", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings({ linkOrigin: "https://saved.example.com" });
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });

  await reset.queue({ id: owner.user!.userId }, "reset-token");
  expect(reset.sentJobs).toHaveLength(1);
  await reset.jobs["instance.sendPasswordResetEmail"]!.run(reset.sentJobs[0]!.payload);

  expect(mail.messages).toMatchObject([
    {
      template: "password_reset",
      values: { resetLink: "https://saved.example.com/reset-password#reset-token" },
      to: TEST_OWNER.email,
      fromName: "Broccoli",
    },
  ]);
});

test("queues no reset email for a user without a password", async ({ orm, seed }) => {
  const owner = await seed.demoOwner({ expiresAt: new Date("2099-01-01T00:00:00Z") });
  await seed.mailSettings();
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });

  await reset.queue({ id: owner.user!.userId }, "reset-token");

  expect(reset.sentJobs).toEqual([]);
  expect(mail.messages).toEqual([]);
});

test("queues no reset email while no email is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });

  await reset.queue({ id: owner.user!.userId }, "reset-token");

  expect(reset.sentJobs).toEqual([]);
  expect(mail.messages).toEqual([]);
});

test("a queued reset sends nothing once no email is chosen", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings();
  const mail = fakeMail();
  const reset = passwordResetEmail(orm, { mail });
  await reset.queue({ id: owner.user!.userId }, "reset-token");
  expect(reset.sentJobs).toHaveLength(1);
  await seed.mailSettings({ source: "no_email" });

  await reset.jobs["instance.sendPasswordResetEmail"]!.run(reset.sentJobs[0]!.payload);

  expect(mail.messages).toEqual([]);
});

test("the queued reset job never holds the token in plain text", async ({ orm, seed }) => {
  const owner = await seed.owner(TEST_OWNER);
  await seed.mailSettings();
  const reset = passwordResetEmail(orm, { mail: fakeMail() });

  await reset.queue({ id: owner.user!.userId }, "private-reset-token");

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
