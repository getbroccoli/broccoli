import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";

import type { RunningServer } from "../../src/server";
import { startTestServer } from "./support/test-server";

// The web app needs no database, so these servers never become ready.
const UNREACHABLE_DATABASE_URL = "postgres://broccoli@127.0.0.1:1/broccoli_test_unreachable";
const INDEX_HTML = "<!doctype html><title>Broccoli</title>";
const ASSET = "console.log('app');";

describe("with a web app folder", () => {
  let webDir: string;
  let server: RunningServer;

  beforeAll(async () => {
    webDir = await mkdtemp(join(tmpdir(), "broccoli-web-"));
    await writeFile(join(webDir, "index.html"), INDEX_HTML);
    await writeFile(join(webDir, "app.js"), ASSET);
    server = await startTestServer(UNREACHABLE_DATABASE_URL, webDir);
  });

  afterAll(async () => {
    await server.stop();
    await rm(webDir, { recursive: true, force: true });
  });

  it("serves the web app at the root", async () => {
    const response = await fetch(`${server.url}/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it("serves the web app for a page link, so the router can show it", async () => {
    const response = await fetch(`${server.url}/people/123`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it("serves a web app file as it is", async () => {
    const response = await fetch(`${server.url}/app.js`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(ASSET);
  });

  it("keeps answering health checks", async () => {
    const response = await fetch(`${server.url}/healthz`);

    expect(await response.json()).toEqual({ status: "ok" });
  });
});

it("serves page links from a relative web app folder inside a hidden folder", async () => {
  const webDir = await mkdtemp(join(tmpdir(), ".broccoli-web-"));
  onTestFinished(() => rm(webDir, { recursive: true, force: true }));
  await writeFile(join(webDir, "index.html"), INDEX_HTML);
  const server = await startTestServer(UNREACHABLE_DATABASE_URL, relative(process.cwd(), webDir));
  onTestFinished(() => server.stop());

  expect(await (await fetch(`${server.url}/people/123`)).text()).toBe(INDEX_HTML);
});

it("serves no web app without a web app folder", async () => {
  const server = await startTestServer(UNREACHABLE_DATABASE_URL);
  onTestFinished(() => server.stop());

  expect((await fetch(`${server.url}/`)).status).toBe(404);
});
