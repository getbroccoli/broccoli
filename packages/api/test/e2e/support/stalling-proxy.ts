import { createServer, connect, type Socket } from "node:net";
import type { AddressInfo } from "node:net";

const DEFAULT_POSTGRES_PORT = 5432;

/** A TCP proxy to Postgres whose traffic can be stalled or cut. */
export interface StallingProxy {
  /** `databaseUrl` with its host and port replaced by the proxy's. */
  url: string;
  stall(): void;
  resume(): void;
  /** Drops every connection and stops accepting new ones. */
  close(): Promise<void>;
}

export async function startStallingProxy(databaseUrl: string): Promise<StallingProxy> {
  const target = new URL(databaseUrl);
  const sockets = new Set<Socket>();
  let stalled = false;

  const server = createServer((client) => {
    const upstream = connect(Number(target.port || DEFAULT_POSTGRES_PORT), target.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
      if (stalled) {
        socket.pause();
      }
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const proxyUrl = new URL(databaseUrl);
  proxyUrl.host = `127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: proxyUrl.href,
    stall: () => {
      stalled = true;
      sockets.forEach((socket) => socket.pause());
    },
    resume: () => {
      stalled = false;
      sockets.forEach((socket) => socket.resume());
    },
    close: async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
