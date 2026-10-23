import { expect, it } from "vitest";

import { Instance, type InstanceState, OwnerExistsError, SetupInProgressError } from ".";

it("claims an owner without changing the original instance and refuses a second claim", () => {
  const instance = exampleInstance();

  const claimed = instance.claimOwner("owner");

  expect(instance.ownerUserId).toBeNull();
  expect(claimed.ownerUserId).toBe("owner");
  expect(() => claimed.claimOwner("another")).toThrow(OwnerExistsError);
});

it.each([
  ["company", "import"],
  ["import", null],
  ["done", null],
] as const)("completing company setup at %s moves to %s", (step, expected) => {
  const instance = exampleInstance({ step });

  const next = instance.completeCompanyStep();

  expect(next?.step ?? null).toBe(expected);
  expect(instance.step).toBe(step);
});

it.each([
  [null, null, "owner"],
  ["owner", null, "done"],
  [
    "owner",
    {
      companyId: "company",
      publicOrigin: "https://app.example.com",
      websiteOrigin: "https://example.com",
    },
    "ready",
  ],
] as const)(
  "approval chooses the next step for owner %s and assignment %s",
  (ownerUserId, assignment, step) => {
    const instance = exampleInstance({ step: "import", ownerUserId, assignment });

    expect(instance.approveImportStep()?.step).toBe(step);
  },
);

it("a managed demo completes setup directly without the approval review step", () => {
  const instance = exampleInstance({
    step: "import",
    ownerUserId: "owner",
    assignment: {
      companyId: "company",
      publicOrigin: "https://app.example.com",
      websiteOrigin: "https://example.com",
    },
  });

  expect(instance.completeImportStep()?.step).toBe("done");
});

it("exiting a live demo clears its owner and deadline together and preserves the AI choice", () => {
  const instance = exampleInstance({
    ownerUserId: "owner",
    step: "done",
    demoExpiresAt: new Date("2026-10-10"),
    aiSource: "broccoli_ai",
  });

  const exited = instance.exitDemo("owner", new Date("2026-10-09"));

  expect(exited).toMatchObject({
    ownerUserId: null,
    demoExpiresAt: null,
    setupSession: null,
    step: "company",
    aiSource: "broccoli_ai",
  });
  expect(instance.ownerUserId).toBe("owner");
});

it.each([
  ["other", "2026-10-09"],
  ["owner", "2026-10-10"],
  ["owner", "2026-10-11"],
])("refuses demo exit by %s at %s", (userId, now) => {
  const instance = exampleInstance({ ownerUserId: "owner", demoExpiresAt: new Date("2026-10-10") });

  expect(() => instance.exitDemo(userId, new Date(now))).toThrow(
    "Only the demo's owner can reset setup.",
  );
});

it("refuses demo exit without a provisional owner deadline", () => {
  const instance = exampleInstance({ ownerUserId: "owner" });

  expect(() => instance.exitDemo("owner", new Date("2026-10-09"))).toThrow(
    "Only the demo's owner can reset setup.",
  );
});

it("does not let callers extend a demo deadline through a supplied or returned Date", () => {
  const deadline = new Date("2026-10-10");
  const instance = exampleInstance({ ownerUserId: "owner", demoExpiresAt: deadline });

  deadline.setUTCFullYear(2030);
  instance.demoExpiresAt!.setUTCFullYear(2030);

  expect(instance.demoDeadlineOf("owner")).toEqual(new Date("2026-10-10"));
  expect(instance.demoDeadlineOf("other")).toBeNull();
});

it("closes external-agent access at the setup session's deadline", () => {
  const instance = exampleInstance({
    step: "import",
    aiSource: "external_agent",
    setupSession: { tokenHash: "hash", expiresAt: new Date("2026-10-10") },
  });

  expect(instance.isSetupOpenToExternalAgent(new Date("2026-10-09"))).toBe(true);
  expect(instance.isSetupOpenToExternalAgent(new Date("2026-10-10"))).toBe(false);
  expect(instance.claimOwner("owner").isSetupOpenToExternalAgent(new Date("2026-10-09"))).toBe(
    false,
  );
});

it("does not let callers alter the stored setup session through its snapshot", () => {
  const session = { tokenHash: "hash", expiresAt: new Date("2026-10-10") };
  const instance = exampleInstance({ setupSession: session });

  session.tokenHash = "changed";
  instance.setupSession!.expiresAt.setUTCFullYear(2030);

  expect(instance.setupSession).toEqual({ tokenHash: "hash", expiresAt: new Date("2026-10-10") });
  expect(() => instance.requireHeldSetup(null, new Date("2026-10-09"))).toThrow(
    SetupInProgressError,
  );
});

it.for([
  { name: "company step", changes: { step: "company" }, expected: true },
  { name: "import step", changes: { step: "import" }, expected: true },
  { name: "saved Broccoli AI", changes: { aiSource: "broccoli_ai" }, expected: false },
  { name: "saved OpenRouter", changes: { aiSource: "openrouter" }, expected: false },
  { name: "saved external agent", changes: { aiSource: "external_agent" }, expected: false },
  { name: "existing owner", changes: { ownerUserId: "owner-id" }, expected: false },
  {
    name: "managed assignment",
    changes: {
      assignment: {
        companyId: "company-1",
        publicOrigin: "https://broccoli.example.com",
        websiteOrigin: "https://example.com",
      },
    },
    expected: false,
  },
  { name: "owner step", changes: { step: "owner" }, expected: false },
] as const)("server agent choice with $name is $expected", ({ changes, expected }) => {
  const instance = exampleInstance(changes);

  expect(instance.canChooseExternalAgentOnServer()).toBe(expected);
});

it.for([
  { name: "company step without a setup session", changes: { step: "company" }, expected: true },
  { name: "import step without a setup session", changes: { step: "import" }, expected: true },
  {
    name: "live setup session",
    changes: {
      setupSession: { tokenHash: "setup-token-hash", expiresAt: new Date("2026-10-20T12:00:01Z") },
    },
    expected: true,
  },
  {
    name: "expired setup session",
    changes: {
      setupSession: { tokenHash: "setup-token-hash", expiresAt: new Date("2026-10-20T11:59:59Z") },
    },
    expected: false,
  },
  {
    name: "setup session expiring now",
    changes: {
      setupSession: { tokenHash: "setup-token-hash", expiresAt: new Date("2026-10-20T12:00:00Z") },
    },
    expected: false,
  },
  { name: "Broccoli AI", changes: { aiSource: "broccoli_ai" }, expected: false },
  { name: "OpenRouter", changes: { aiSource: "openrouter" }, expected: false },
  { name: "no AI source", changes: { aiSource: null }, expected: false },
  { name: "existing owner", changes: { ownerUserId: "owner-id" }, expected: false },
  {
    name: "managed assignment",
    changes: {
      assignment: {
        companyId: "company-1",
        publicOrigin: "https://broccoli.example.com",
        websiteOrigin: "https://example.com",
      },
    },
    expected: false,
  },
  { name: "owner step", changes: { step: "owner" }, expected: false },
] as const)("setup open to the external agent with $name is $expected", ({ changes, expected }) => {
  const instance = exampleInstance({
    aiSource: "external_agent",
    ...changes,
  });
  const now = new Date("2026-10-20T12:00:00Z");

  expect(instance.isSetupOpenToExternalAgent(now)).toBe(expected);
});

function exampleInstance(state: Partial<InstanceState> = {}): Instance {
  return new Instance({
    ownerUserId: null,
    step: "company",
    setupSession: null,
    demoExpiresAt: null,
    aiSource: null,
    assignment: null,
    ownerSignInMethod: null,
    ...state,
  });
}
