import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";

it("ends the worker when fetch is called before the next statement runs", async () => {
  const worker = new Worker(
    `const { parentPort, workerData } = require("node:worker_threads");
     import(workerData).then(({ installFetchGuard }) => {
       installFetchGuard();
       parentPort.postMessage("installed");
       fetch("https://example.com/");
       parentPort.postMessage("continued");
     });`,
    { eval: true, workerData: new URL("./fetchGuard.ts", import.meta.url).href },
  );
  const messages: unknown[] = [];
  worker.on("message", (message: unknown) => messages.push(message));

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      worker.once("exit", resolve);
      worker.once("error", reject);
    });

    expect(exitCode).toBe(1);
    expect(messages).toEqual(["installed"]);
  } finally {
    await worker.terminate();
  }
});
