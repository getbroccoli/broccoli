import { sql } from "drizzle-orm";

import { createAgentCode, exchangeAgentCode, expect, test, TestEnv } from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("refuses database-incompatible person text without echoing the person's email", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const code = await createAgentCode(browser, "PARSES_ORIGINAL_FILES");
  const token = await exchangeAgentCode(env.url, code, "parses_original_files");

  const response = await fetch(`${env.url}/api/agent/people`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: "staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com", jobTitle: "Lead\u0000Dev" }],
    }),
  });
  const text = await response.text();

  expect(text).not.toContain("avery@example.com");
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(JSON.parse(text)).toEqual({
    error: {
      code: "INVALID_INPUT",
      fields: [{ field: "people[0].jobTitle", code: "invalid" }],
    },
  });
});

test("answers an unexpected database failure with INTERNAL and logs no personal values", async ({
  onTestFinished,
}) => {
  const lines: string[] = [];
  const env = await TestEnv.start({
    logger: createLogger("error", { write: (line) => lines.push(line) }),
  });
  onTestFinished(() => env.stop());
  const browser = await env.startSetupAtImport();
  const code = await createAgentCode(browser, "PARSES_ORIGINAL_FILES");
  const token = await exchangeAgentCode(env.url, code, "parses_original_files");
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    // A real storage failure after valid input, so input validation cannot hide the error handler.
    await database.orm.execute(sql`
      alter table import_records add constraint refuse_test_import check (false)
    `);
  } finally {
    await database.close();
  }

  const response = await fetch(`${env.url}/api/agent/people`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      name: "private-staff.pdf",
      people: [{ fullName: "Avery Stone", email: "avery@example.com", jobTitle: "Designer" }],
    }),
  });
  const text = await response.text();

  expect(text).not.toContain("avery@example.com");
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(JSON.parse(text)).toEqual({ error: { code: "INTERNAL" } });
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({ level: 50 });
  for (const value of ["avery@example.com", "Avery Stone", "private-staff.pdf", token, code]) {
    expect(lines.join("")).not.toContain(value);
  }
});
