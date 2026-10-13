import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Serves any request listener, such as a small Express app, on a free local port
 * until `stop` is called. Use it to drive our own HTTP code from a test; for a fake
 * external JSON service use `startFakeHttpServer`, for Broccoli itself
 * `startTestBroccoliServer`.
 */
export async function startSimpleHttpServer(listener: RequestListener) {
  const server = createServer(listener);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
