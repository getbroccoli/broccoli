import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.js";

const DATABASE_URL = "postgres://broccoli@localhost:5432/broccoli";

describe("loadEnv", () => {
  it("reads the configured values", () => {
    const env = loadEnv({ DATABASE_URL, PORT: "8080", LOG_LEVEL: "debug" });

    expect(env).toEqual({
      databaseUrl: DATABASE_URL,
      port: 8080,
      logLevel: "debug",
    });
  });

  it("applies defaults for optional values", () => {
    const env = loadEnv({ DATABASE_URL });

    expect(env.port).toBe(3000);
    expect(env.logLevel).toBe("info");
  });

  it("treats blank values as unset", () => {
    const env = loadEnv({ DATABASE_URL, PORT: "", LOG_LEVEL: "  " });

    expect(env.port).toBe(3000);
    expect(env.logLevel).toBe("info");
  });

  it("rejects a database URL that is not a Postgres URL", () => {
    expect(() => loadEnv({ DATABASE_URL: "mysql://localhost/broccoli" })).toThrow(/DATABASE_URL/);
  });

  it("reports every invalid variable in one error", () => {
    expect(() => loadEnv({ DATABASE_URL: "", PORT: "http" })).toThrow(/DATABASE_URL[\s\S]*PORT/);
  });
});
