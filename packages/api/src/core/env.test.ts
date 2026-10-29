import { expect, it } from "vitest";

import { DEFAULT_ACCOUNTS_URL, loadEnv } from "./env";

const DATABASE = { DATABASE_URL: "postgres://broccoli@localhost/broccoli" };
const MANAGED = {
  ...DATABASE,
  BROCCOLI_MODE: "managed",
  MANAGED_INSTANCE_ID: "slot-1",
};

it.each(["self_hosted", "managed"])("defaults the relay URLs in %s mode", (mode) => {
  const env = loadEnv(mode === "managed" ? MANAGED : DATABASE);

  expect(env.broccoliAiUrl).toBe("https://integrations.dev.getbroccoli.com/ai");
  expect(env.slackRelayUrl).toBe("https://integrations.dev.getbroccoli.com");
});

it.each(["self_hosted", "managed"])("accepts a Broccoli AI URL in %s mode", (mode) => {
  const env = loadEnv({
    ...(mode === "managed" ? MANAGED : DATABASE),
    BROCCOLI_AI_URL: "https://relay.example.com/ai",
  });

  expect(env.broccoliAiUrl).toBe("https://relay.example.com/ai");
});

it("starts managed without an OpenRouter key", () => {
  expect(loadEnv(MANAGED).openRouterKey).toBeNull();
});

it("reads the model key when self-hosted", () => {
  expect(loadEnv({ ...DATABASE, OPENROUTER_API_KEY: "test-model-key" }).openRouterKey).toBe(
    "test-model-key",
  );
});

it("refuses an OpenRouter key when managed", () => {
  expect(() =>
    loadEnv({
      ...MANAGED,
      OPENROUTER_API_KEY: "test-model-key",
    }),
  ).toThrow("Only for BROCCOLI_MODE=self_hosted");
});

it("reads the self-hosted public URL", () => {
  const env = loadEnv({ ...DATABASE, SELF_HOSTED_PUBLIC_URL: "https://hr.example.com" });
  expect(env.deployment).toMatchObject({ publicUrl: "https://hr.example.com" });
});

it.each([
  ["MANAGED_INSTANCE_ID", "slot-1"],
  ["MANAGED_ACCOUNTS_URL", "https://accounts.example.com"],
  ["MANAGED_MAIL_RELAY_URL", "https://relay.example.com/mail"],
])("refuses %s when self-hosted", (variable, value) => {
  expect(() => loadEnv({ ...DATABASE, [variable]: value })).toThrow(variable);
});

it("uses the configured accounts origin", () => {
  const env = loadEnv({
    ...MANAGED,
    MANAGED_ACCOUNTS_URL: "https://accounts.example.com/",
  });

  expect(env.deployment).toMatchObject({ accountsOrigin: "https://accounts.example.com" });
});

it("requires the instance id when managed", () => {
  expect(() => loadEnv({ ...DATABASE, BROCCOLI_MODE: "managed" })).toThrow(/MANAGED_INSTANCE_ID/);
});

it("defaults the accounts origin and the mail relay when managed", () => {
  const env = loadEnv(MANAGED);
  expect(env.deployment).toEqual({
    mode: "managed",
    instanceId: "slot-1",
    accountsOrigin: DEFAULT_ACCOUNTS_URL,
    mailRelayUrl: "https://integrations.dev.getbroccoli.com/mail",
  });
});

it("reads the mail relay URL when managed", () => {
  const env = loadEnv({
    ...MANAGED,
    MANAGED_MAIL_RELAY_URL: "https://relay.example.com/mail",
  });

  expect(env.deployment).toMatchObject({ mailRelayUrl: "https://relay.example.com/mail" });
});

it("refuses the self-hosted public URL when managed", () => {
  expect(() =>
    loadEnv({
      ...MANAGED,
      SELF_HOSTED_PUBLIC_URL: "https://hr.example.com",
    }),
  ).toThrow(/SELF_HOSTED_PUBLIC_URL/);
});

it("refuses an accounts URL with a path", () => {
  expect(() =>
    loadEnv({
      ...MANAGED,
      MANAGED_ACCOUNTS_URL: "https://accounts.example.com/x",
    }),
  ).toThrow(/MANAGED_ACCOUNTS_URL/);
});
