import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";

import { expect, it, onTestFinished } from "vitest";

import { ensureSecret } from ".";

// shortcut: thousands of concurrent file writes time out on the shared CI host, so this runs only
// locally; run it in CI again once CI has its own machine.
const inCi = Boolean(process.env.CI);

it.skipIf(inCi)("returns the same persisted secret to every concurrent creator", async () => {
  const root = await mkdtemp(join(tmpdir(), "broccoli-secrets-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));

  for (let attempt = 0; attempt < 50; attempt++) {
    const dataDir = join(root, String(attempt));
    const batches: Promise<PromiseSettledResult<string>[]>[] = [];
    for (let batch = 0; batch < 10; batch++) {
      batches.push(
        Promise.allSettled(Array.from({ length: 10 }, () => ensureSecret(dataDir, "auth-secret"))),
      );
      await setImmediate();
    }

    const results = (await Promise.all(batches)).flat();
    const secret = await readFile(join(dataDir, "secrets", "auth-secret"), "utf8");
    expect(secret).not.toBe("");
    expect(results).toEqual(
      Array.from({ length: 100 }, () => ({ status: "fulfilled", value: secret })),
    );
  }
});
