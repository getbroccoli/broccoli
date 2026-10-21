import { expect, it } from "vitest";

import { aiConfig } from "./aiConfig";

it("uses Broccoli AI when no source or key is configured", () => {
  const ai = aiConfig({ source: null, openRouterKey: null }, null);

  expect(ai).toEqual({ source: "broccoli_ai", openRouterKey: null });
});

it("uses the environment key when no source is chosen", () => {
  const ai = aiConfig({ source: null, openRouterKey: null }, "environment-key");

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

it("keeps the Broccoli AI choice when an environment key exists", () => {
  const ai = aiConfig({ source: "broccoli_ai", openRouterKey: null }, "environment-key");

  expect(ai).toEqual({
    source: "broccoli_ai",
    openRouterKey: { key: "environment-key", origin: "environment" },
  });
});

it("uses the saved key before the environment key", () => {
  const ai = aiConfig({ source: "openrouter", openRouterKey: "saved-key" }, "environment-key");

  expect(ai).toEqual({
    source: "openrouter",
    openRouterKey: { key: "saved-key", origin: "saved" },
  });
});

it("keeps the OpenRouter choice when no key exists", () => {
  const ai = aiConfig({ source: "openrouter", openRouterKey: null }, null);

  expect(ai).toEqual({ source: "openrouter", openRouterKey: null });
});
