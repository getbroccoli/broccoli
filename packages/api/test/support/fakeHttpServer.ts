import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

type Answer = { status: number; body?: unknown };

/** Async answers let a timeout test hold a response without sleeping. */
export async function startFakeHttpServer(answer: (path: string) => Answer | Promise<Answer>) {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(404).end();
      return;
    }
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    paths.push(path);
    void Promise.resolve()
      .then(() => answer(path))
      .then(({ status, body }) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(typeof body === "string" ? body : JSON.stringify(body));
      })
      .catch(() => response.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    paths,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
