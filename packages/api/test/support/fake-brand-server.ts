import { startFakeHttpServer } from "./fake-http-server";

type Answer = { status: number; body?: unknown };

export async function startFakeBrandServer(answer: (domain: string) => Answer | Promise<Answer>) {
  const requests: string[] = [];
  const server = await startFakeHttpServer((path) => {
    if (!path.startsWith("/brands/")) {
      return { status: 404 };
    }
    const domain = path.slice("/brands/".length);
    requests.push(domain);
    return answer(domain);
  });
  return {
    url: server.url,
    requests,
    stop: server.stop,
  };
}
