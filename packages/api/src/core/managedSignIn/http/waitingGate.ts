import type { RequestHandler } from "express";

import type { AuthSource } from "../../auth";

const RETRY_AFTER_SECONDS = "5";

const PREPARING_PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Preparing your workspace</title>
</head>
<body style="font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0">
<main style="text-align: center; padding: 1rem">
<h1>Your workspace is being prepared</h1>
<p>This takes a moment.</p>
<p><a href="">Reload</a></p>
</main>
</body>
</html>`;

/**
 * Until a managed instance is assigned, users get 503: a short page for browsers, JSON
 * for API calls. Probes and init are mounted before this gate.
 */
export function waitingGate(auth: AuthSource): RequestHandler {
  return async (request, response, next) => {
    if (await isAssigned(auth)) {
      next();
      return;
    }
    response.set({ "Retry-After": RETRY_AFTER_SECONDS, "Cache-Control": "no-store" }).status(503);
    if (request.method === "GET" && request.accepts(["json", "html"]) === "html") {
      response.type("html").send(PREPARING_PAGE);
    } else {
      response.json({ error: "preparing" });
    }
  };
}

async function isAssigned(auth: AuthSource): Promise<boolean> {
  try {
    return (await auth.current()) !== null;
  } catch {
    // The database is unreachable or not migrated yet: still waiting.
    return false;
  }
}
