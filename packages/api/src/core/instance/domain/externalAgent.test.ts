import { expect, test } from "vitest";

import { canChooseExternalAgentOnServer, isSetupOpenToExternalAgent } from "./externalAgent";
import type { Instance } from "./instance";

test.for([
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
  const instance = { ...UNCONFIGURED_INSTANCE, ...changes };

  expect(canChooseExternalAgentOnServer(instance)).toBe(expected);
});

test.for([
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
  const instance: Instance = {
    ...UNCONFIGURED_INSTANCE,
    aiSource: "external_agent",
    ...changes,
  };
  const now = new Date("2026-10-20T12:00:00Z");

  expect(isSetupOpenToExternalAgent(instance, now)).toBe(expected);
});

const UNCONFIGURED_INSTANCE: Instance = {
  ownerUserId: null,
  step: "company",
  setupSession: null,
  demoExpiresAt: null,
  aiSource: null,
  assignment: null,
  ownerSignInMethod: null,
};
