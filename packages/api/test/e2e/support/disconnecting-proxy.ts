import { connect, createServer, type AddressInfo, type Socket } from "node:net";

const DEFAULT_POSTGRES_PORT = 5432;

/** A TCP proxy to Postgres whose connections can be cut, as if the network failed. */
export interface DisconnectingProxy {
  /** `databaseUrl` with its host and port replaced by the proxy's. */
  url: string;
  /** Drops every connection and stops accepting new ones. */
  disconnect(): Promise<void>;
}

/** Listens on `port`, or on a free port when it is 0. */
export async function startDisconnectingProxy(
  databaseUrl: string,
  port = 0,
): Promise<DisconnectingProxy> {
  const target = new URL(databaseUrl);
  const sockets = new Set<Socket>();

  const server = createServer((client) => {
    const upstream = connect(Number(target.port || DEFAULT_POSTGRES_PORT), target.hostname);
    for (const socket of [client, upstream]) {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

  const proxyUrl = new URL(databaseUrl);
  proxyUrl.host = `127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    url: proxyUrl.href,
    disconnect: async () => {
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
