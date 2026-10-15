import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { onTestFinished } from "vitest";

import { expect, test, TEST_OWNER, type TestEnv } from "#test/support";

test("People uses the narrow viewport and keeps table scrolling inside its frame", async ({
  env,
}) => {
  const browser = await openImport(env);
  await browser("find", "role", "button", "click", "--name", "Skip for now");
  await browser("wait", "table tbody tr");

  for (const width of [390, 1280]) {
    await browser("set", "viewport", String(width), "900");
    expect(await browser("eval", `document.documentElement.scrollWidth <= ${width}`)).toBe("true");
    expect(
      await browser(
        "eval",
        `document.querySelector('main section').clientWidth >= ${width === 390 ? 320 : 900}`,
      ),
    ).toBe("true");
    expect(
      await browser(
        "eval",
        `document.querySelector('input[type=search]').getBoundingClientRect().right <= ${width}`,
      ),
    ).toBe("true");
    expect(
      await browser(
        "eval",
        `(() => {
      const nav = document.querySelector('aside').getBoundingClientRect();
      const main = document.querySelector('main').getBoundingClientRect();
      return ${width === 390 ? "nav.bottom <= main.top" : "nav.right <= main.left && nav.width === 224"};
    })()`,
      ),
    ).toBe("true");
  }

  await browser("set", "viewport", "390", "900");
  expect(
    await browser(
      "eval",
      `(() => {
    const table = document.querySelector('table');
    const frame = table.parentElement;
    const name = table.querySelector('th');
    const before = name.getBoundingClientRect().left;
    frame.scrollLeft = frame.scrollWidth;
    frame.scrollTop = 150;
    return frame.scrollLeft > 0 && Math.abs(name.getBoundingClientRect().left - before) < 1
      && name.clientWidth <= frame.clientWidth / 2
      && [...table.querySelectorAll('th')].every(header => header.clientWidth >= 80)
      && Math.abs(table.querySelector('thead').getBoundingClientRect().top - frame.getBoundingClientRect().top) < 1;
  })()`,
    ),
  ).toBe("true");
  await browser("fill", "input[type=search]", "no-such-person");
  await browser("wait", "--text", "No people match");
  await browser("find", "role", "button", "click", "--name", "Clear search");
  await browser("wait", "table tbody tr");
});

test("Connect Slack is a keyboard-accessible native link, without button semantics or warnings", async ({
  env,
}) => {
  const browser = await openImport(env);
  await browser("wait", "a[href='/api/integrations/slack/connect']");
  expect(
    await browser(
      "eval",
      `(() => {
    const link = document.querySelector('a[href="/api/integrations/slack/connect"]');
    return !link.hasAttribute('role') && !link.hasAttribute('type') && link.tabIndex === 0;
  })()`,
    ),
  ).toBe("true");
  await browser("focus", "a[href='/api/integrations/slack/connect']");
  await browser("press", "Tab");
  expect(await browser("eval", "document.activeElement.textContent.includes('Skip for now')")).toBe(
    "true",
  );
  expect(await browser("console")).not.toContain("A component that acts as a button");
});

async function openImport(env: TestEnv) {
  await env.restart({ webDir: resolve("../web/dist") });
  const { browser: owner } = await env.signInAsOwner();
  const company = await owner.graphql(
    'mutation { company { update(input: { name: "Acme Corp" }) { id } } }',
  );
  expect(await company.json()).not.toHaveProperty("errors");

  const session = `regression-${randomUUID()}`;
  const run = promisify(execFile);
  const browser = async (...args: string[]) => {
    const { stdout } = await run("agent-browser", ["--session", session, ...args]);
    return stdout.trim();
  };
  onTestFinished(async () => {
    await browser("close");
  });
  await browser("open", env.url);
  expect(
    await browser(
      "eval",
      `fetch('/api/auth/sign-in/email', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(${JSON.stringify(TEST_OWNER)})
  }).then(response => response.status)`,
    ),
  ).toBe("200");
  await browser("open", `${env.url}/setup/import`);
  await browser("wait", "a[href='/api/integrations/slack/connect']");
  return browser;
}
