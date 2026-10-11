export type Browser = ReturnType<typeof createBrowser>;

/** A client that keeps cookies like a browser and sends its own address as the Origin. */
export function createBrowser(baseUrl: string) {
  const cookies = new Map<string, string>();

  async function request(path: string, method: string, body?: unknown): Promise<Response> {
    const response = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]!;
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "") cookies.delete(name);
      else cookies.set(name, value);
    }

    return response;
  }

  return {
    post: (path: string, body: unknown) => request(path, "POST", body),
    get: (path: string) => request(path, "GET"),
    graphql: (query: string, variables?: Record<string, unknown>) =>
      request("/api/graphql", "POST", { query, variables }),
  };
}
