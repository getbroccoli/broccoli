import express from "express";

import { sendApplicationError } from "../../applicationError";
import type { EventHandlers } from "../../events";
import { requireSignedIn, type SecurityResolver } from "../../security";

/** Often enough that proxies never close a quiet stream. */
const HEARTBEAT_MS = 25_000;
/** The only message a stream sends: read the agent connection again. Never data. */
const AGENT_CONNECTION_CHANGED = `data: ${JSON.stringify({ type: "agentConnection.changed" })}\n\n`;

/**
 * `GET /api/live`: a server-sent events stream per signed-in browser tab that tells the page when
 * to read again, so the page shows a change at once without the stream carrying any data. Streams
 * live in this process; one API process serves an instance.
 */
export interface LiveNudges {
  router: express.Router;
  /** Nudges a person's open streams after their agent connection changes. */
  events: EventHandlers;
  /** Ends every open stream, so the server can stop without waiting for them. */
  close(): void;
}

export function createLiveNudges(resolveSecurity: SecurityResolver): LiveNudges {
  const streams = new Map<string, Set<express.Response>>();

  const router = express.Router().get("/live", async (request, response) => {
    let userId: string;
    try {
      const { security, renewedCookies } = await resolveSecurity(request.headers);
      const user = requireSignedIn(security).user;
      if (!user) {
        response.sendStatus(401);
        return;
      }
      userId = user.userId;
      if (renewedCookies.length > 0) response.set("Set-Cookie", renewedCookies);
    } catch (error) {
      sendApplicationError(error, response);
      return;
    }
    response
      .status(200)
      .set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        // Tells a buffering proxy to pass each message on at once.
        "X-Accel-Buffering": "no",
      })
      // A proxy may hold the headers back until the first bytes, so the stream opens with a comment.
      .write(": open\n\n");
    const own = streams.get(userId) ?? new Set();
    streams.set(userId, own.add(response));
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), HEARTBEAT_MS);
    response.on("close", () => {
      clearInterval(heartbeat);
      own.delete(response);
      if (own.size === 0) streams.delete(userId);
    });
  });

  return {
    router,
    events: {
      "agentAccess.connection_changed": ({ userId }) => {
        for (const stream of streams.get(userId) ?? []) stream.write(AGENT_CONNECTION_CHANGED);
        return Promise.resolve();
      },
    },
    close() {
      for (const stream of [...streams.values()].flatMap((own) => [...own])) stream.end();
    },
  };
}
