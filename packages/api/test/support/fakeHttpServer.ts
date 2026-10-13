import { startSimpleHttpServer } from "./simpleHttpServer";

type Answer = { status: number; body?: unknown };

/**
 * Stands in for an external JSON service, such as the brand lookup: answers GET
 * requests with `answer(path)` and records the paths asked for. Async answers let a
 * timeout test hold a response without sleeping.
 */
export async function startFakeHttpServer(answer: (path: string) => Answer | Promise<Answer>) {
  const paths: string[] = [];
  const server = await startSimpleHttpServer((request, response) => {
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
  return { ...server, paths };
}
