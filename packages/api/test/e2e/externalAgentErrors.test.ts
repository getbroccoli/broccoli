import { sql } from "drizzle-orm";

import {
  createExternalAgentCode,
  exchangeExternalAgentCode,
  expect,
  test,
  TestEnv,
} from "#test/support";

import { connectDatabase } from "../../src/core/db";
import { createLogger } from "../../src/core/logger";

test("refuses a malformed external agent path without logging its contents", async ({
  onTestFinished,
}) => {
  const lines: string[] = [];
  const env = await TestEnv.start({
    logger: createLogger("error", { write: (line) => lines.push(line) }),
  });
  onTestFinished(() => env.stop());
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const token = await exchangeExternalAgentCode(env.url, code);

  const response = await fetch(
    `${env.url}/api/external-agent/unanswered-files/private@example.com%E0%A4%A/questions`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
  expect(lines.join("")).not.toContain("private@example.com");
});

test("refuses malformed answer JSON without returning or logging its contents", async ({
  onTestFinished,
}) => {
  const lines: string[] = [];
  const env = await TestEnv.start({
    logger: createLogger("error", { write: (line) => lines.push(line) }),
  });
  onTestFinished(() => env.stop());
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const uploaded = await browser.post(
    "/api/setup/external-agent-files?name=staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  expect(uploaded.status).toBe(200);
  const { id } = (await uploaded.json()) as { id: string };
  const token = await exchangeExternalAgentCode(env.url, code);
  const sentinel = "private-answer-sentinel@example.com";

  const response = await fetch(`${env.url}/api/external-agent/unanswered-files/${id}/answers`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: `{"sheets":"${sentinel}",`,
  });
  const body = await response.text();

  expect(response.status).toBe(400);
  expect(JSON.parse(body)).toEqual({ error: { code: "INVALID_INPUT" } });
  expect(body).not.toContain(sentinel);
  expect(lines.join("")).not.toContain(sentinel);
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
  const code = await createExternalAgentCode(browser);
  const uploaded = await browser.post(
    "/api/setup/external-agent-files?name=private-staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  const { id } = (await uploaded.json()) as { id: string };
  const token = await exchangeExternalAgentCode(env.url, code);
  const database = connectDatabase(env.db.url, createLogger("silent"));
  try {
    // A real storage failure after valid input, so input validation cannot hide the error handler.
    await database.orm.execute(sql`
      alter table import_records add constraint refuse_test_import check (false)
    `);
  } finally {
    await database.close();
  }

  const response = await fetch(`${env.url}/api/external-agent/unanswered-files/${id}/answers`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      sheets: [
        {
          sheet: 1,
          answers: {
            headerRow: "1",
            fullName: "A",
            firstName: "none",
            lastName: "none",
            email: "B",
            jobTitle: "none",
            startDate: "none",
          },
        },
      ],
    }),
  });
  const text = await response.text();

  expect(text).not.toContain("avery@example.com");
  expect(response.status).toBe(500);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(JSON.parse(text)).toEqual({ error: { code: "INTERNAL" } });
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({ level: 50 });
  for (const value of ["avery@example.com", "Avery Stone", "private-staff.csv", token, code]) {
    expect(lines.join("")).not.toContain(value);
  }
});
