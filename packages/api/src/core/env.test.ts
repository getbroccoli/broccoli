import { expect, it } from "vitest";

import { DEFAULT_ACCOUNTS_URL, loadEnv } from "./env";

const DATABASE = { DATABASE_URL: "postgres://broccoli@localhost/broccoli" };

it("needs no settings when self-hosted", () => {
  expect(loadEnv(DATABASE).deployment).toEqual({ mode: "self_hosted" });
});

it("reads the self-hosted public URL", () => {
  const env = loadEnv({ ...DATABASE, SELF_HOSTED_PUBLIC_URL: "https://hr.example.com" });
  expect(env.deployment).toEqual({ mode: "self_hosted", publicUrl: "https://hr.example.com" });
});

it.each([
  ["MANAGED_INSTANCE_ID", "slot-1"],
  ["MANAGED_ACCOUNTS_URL", "https://accounts.example.com"],
])("refuses %s when self-hosted", (variable, value) => {
  expect(() => loadEnv({ ...DATABASE, [variable]: value })).toThrow(variable);
});

it("uses the configured accounts origin", () => {
  const env = loadEnv({
    ...DATABASE,
    BROCCOLI_MODE: "managed",
    MANAGED_INSTANCE_ID: "slot-1",
    MANAGED_ACCOUNTS_URL: "https://accounts.example.com/",
  });

  expect(env.deployment).toMatchObject({ accountsOrigin: "https://accounts.example.com" });
});

it("requires the instance id when managed", () => {
  expect(() => loadEnv({ ...DATABASE, BROCCOLI_MODE: "managed" })).toThrow(/MANAGED_INSTANCE_ID/);
});

it("defaults the accounts origin when managed", () => {
  const env = loadEnv({ ...DATABASE, BROCCOLI_MODE: "managed", MANAGED_INSTANCE_ID: "slot-1" });
  expect(env.deployment).toEqual({
    mode: "managed",
    instanceId: "slot-1",
    accountsOrigin: DEFAULT_ACCOUNTS_URL,
  });
});

it("refuses the self-hosted public URL when managed", () => {
  expect(() =>
    loadEnv({
      ...DATABASE,
      BROCCOLI_MODE: "managed",
      MANAGED_INSTANCE_ID: "slot-1",
      SELF_HOSTED_PUBLIC_URL: "https://hr.example.com",
    }),
  ).toThrow(/SELF_HOSTED_PUBLIC_URL/);
});

it("refuses an accounts URL with a path", () => {
  expect(() =>
    loadEnv({
      ...DATABASE,
      BROCCOLI_MODE: "managed",
      MANAGED_INSTANCE_ID: "slot-1",
      MANAGED_ACCOUNTS_URL: "https://accounts.example.com/x",
    }),
  ).toThrow(/MANAGED_ACCOUNTS_URL/);
});
