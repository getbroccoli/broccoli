import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

type Answer = { status: number; body?: unknown };

/** Async answers let a timeout test hold a response without sleeping. */
export async function startFakeBrandServer(answer: (domain: string) => Answer | Promise<Answer>) {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (request.method !== "GET" || !path.startsWith("/brands/")) {
      response.writeHead(404).end();
      return;
    }
    const domain = path.slice("/brands/".length);
    requests.push(domain);
    void Promise.resolve()
      .then(() => answer(domain))
      .then(({ status, body }) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(body === undefined ? undefined : JSON.stringify(body));
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
    requests,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
