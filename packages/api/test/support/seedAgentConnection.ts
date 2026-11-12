import { randomUUID } from "node:crypto";

import { oauthClient, oauthConsent, user } from "../../src/core/auth";
import type { Orm } from "../../src/core/db";

/**
 * A person's agent connection as Allow leaves it: a registered client and the person's consent,
 * with the user row added when the test's security context has none.
 */
export async function seedAgentConnection(
  orm: Orm,
  {
    userId,
    clientName = "Claude Code",
    connectedAt = new Date(),
  }: { userId: string; clientName?: string | null; connectedAt?: Date },
): Promise<{ clientId: string; connectionId: string }> {
  const clientId = randomUUID();
  const connectionId = randomUUID();
  await orm
    .insert(user)
    .values({ id: userId, name: "User", email: `${userId}@example.com` })
    .onConflictDoNothing();
  await orm.insert(oauthClient).values({
    id: randomUUID(),
    clientId,
    name: clientName,
    redirectUris: ["http://127.0.0.1:33418/callback"],
  });
  await orm.insert(oauthConsent).values({
    id: connectionId,
    clientId,
    userId,
    scopes: ["broccoli:read", "offline_access"],
    createdAt: connectedAt,
    updatedAt: connectedAt,
  });
  return { clientId, connectionId };
}
