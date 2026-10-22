import { startSimpleHttpServer } from "./simpleHttpServer";

type Answer = { status: number; body?: Buffer };

export async function startFakeBrandServer(answer: (domain: string) => Answer) {
  const requests: string[] = [];
  const queries: string[] = [];
  const server = await startSimpleHttpServer((request, response) => {
    if (request.method !== "GET") {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://example.com");
    const domain = url.pathname.slice(1);
    requests.push(domain);
    queries.push(url.searchParams.toString());
    const { status, body } = answer(domain);
    response.writeHead(status, status === 200 ? { "content-type": "image/png" } : {});
    response.end(body);
  });
  return {
    url: server.url,
    requests,
    queries,
    stop: server.stop,
  };
}
