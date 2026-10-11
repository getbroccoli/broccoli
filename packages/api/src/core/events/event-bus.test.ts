import { EXAMPLE_PAYLOAD } from "#test/support";
import { expect, it } from "vitest";

import { createLogger } from "../logger";
import { createEventBus } from ".";

it("delivers the payload to a subscribed handler", async () => {
  const eventBus = createEventBus(createLogger("silent"));
  const received: unknown[] = [];
  eventBus.subscribe({
    "example.happened": (payload) => {
      received.push(payload);
      return Promise.resolve();
    },
  });

  await eventBus.dispatch([{ type: "example.happened", payload: EXAMPLE_PAYLOAD }]);

  expect(received).toEqual([EXAMPLE_PAYLOAD]);
});

it("logs a failing handler and still awaits the next handler", async () => {
  const logs: string[] = [];
  const logger = createLogger("warn", {
    write: (line) => {
      logs.push(line);
    },
  });
  const eventBus = createEventBus(logger);
  const received: unknown[] = [];
  eventBus.subscribe({
    "example.happened": () => {
      throw new Error("Handler failed");
    },
  });
  eventBus.subscribe({
    "example.happened": async (payload) => {
      await Promise.resolve();
      received.push(payload);
    },
  });

  await expect(
    eventBus.dispatch([{ type: "example.happened", payload: EXAMPLE_PAYLOAD }]),
  ).resolves.toBeUndefined();

  expect(received).toEqual([EXAMPLE_PAYLOAD]);
  expect(logs.join("")).toContain("example.happened");
});
