import { expect, it } from "vitest";

import { createLogger } from "../logger";
import { createEventBus } from ".";

const owner = { userId: "test-owner", email: "owner@example.com" };

it("delivers the payload to a subscribed handler", async () => {
  const events = createEventBus(createLogger("silent"));
  const received: unknown[] = [];
  events.subscribe({
    "instance.owner_claimed": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await events.dispatch([{ type: "instance.owner_claimed", payload: owner }]);

  expect(received).toEqual([owner]);
});

it("logs a failing handler and still awaits the next handler", async () => {
  const logs: string[] = [];
  const logger = createLogger("warn", {
    write: (line) => {
      logs.push(line);
    },
  });
  const events = createEventBus(logger);
  const received: unknown[] = [];
  events.subscribe({
    "instance.owner_claimed": () => {
      throw new Error("Handler failed");
    },
  });
  events.subscribe({
    "instance.owner_claimed": async (payload) => {
      await Promise.resolve();
      received.push(payload);
    },
  });

  await expect(
    events.dispatch([{ type: "instance.owner_claimed", payload: owner }]),
  ).resolves.toBeUndefined();

  expect(received).toEqual([owner]);
  expect(logs.join("")).toContain("instance.owner_claimed");
});
