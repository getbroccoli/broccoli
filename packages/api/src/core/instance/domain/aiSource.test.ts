import { expect, it } from "vitest";

import { aiConfig } from "./aiSource";

it("uses Broccoli AI when no source or key is configured", () => {
  const ai = aiConfig("self_hosted", { source: null, openRouterKey: null }, null);

  expect(ai).toEqual({ source: "broccoli_ai", openRouterKey: null });
});

it("uses the environment key when no source is chosen", () => {
  const ai = aiConfig("self_hosted", { source: null, openRouterKey: null }, "environment-key");

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

it("keeps the Broccoli AI choice when an environment key exists", () => {
  const ai = aiConfig(
    "self_hosted",
    { source: "broccoli_ai", openRouterKey: null },
    "environment-key",
  );

  expect(ai).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

it("uses the saved key before the environment key", () => {
  const ai = aiConfig(
    "self_hosted",
    { source: "openrouter", openRouterKey: "saved-key" },
    "environment-key",
  );

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

it("keeps the OpenRouter choice when no key exists", () => {
  const ai = aiConfig("self_hosted", { source: "openrouter", openRouterKey: null }, null);

  expect(ai).toEqual({ source: "openrouter", openRouterKey: null });
});

it("uses OpenRouter in managed mode despite a saved Broccoli AI choice", () => {
  const ai = aiConfig("managed", { source: "broccoli_ai", openRouterKey: null }, "environment-key");

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

it("uses the environment key in managed mode despite a saved key", () => {
  const ai = aiConfig(
    "managed",
    { source: "openrouter", openRouterKey: "saved-key" },
    "environment-key",
  );

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});
