import { describe, expect, it } from "vitest";

import { getHealthStatus } from "./health.js";

describe("getHealthStatus", () => {
  it("reports the service as ok", () => {
    expect(getHealthStatus()).toEqual({ status: "ok" });
  });
});
