import { expect, it } from "vitest";

import { DecisionsError, refusal } from "./decisions";

it("keeps a refusal retryable when its body stream breaks", async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.error(new Error("Connection reset"));
    },
  });
  const response = new Response(body, { status: 403 });

  const error = await refusal(response);

  expect(error).toBeInstanceOf(DecisionsError);
  expect(error.retryable).toBe(true);
});
