import { type Orm, ormOf, type Tx } from "../../../core/db";
import { slackConnection } from "./slackConnectionTable";

/** The connected workspace as stored; the token stays encrypted. */
export interface StoredSlackConnection {
  teamId: string;
  teamName: string;
  encryptedToken: string;
}

export type SlackConnectionRepository = ReturnType<typeof slackConnectionRepository>;

/** The Slack connection row, through the pool or inside a transaction. */
export function slackConnectionRepository(db: Orm | Tx) {
  const orm = () => ormOf(db);

  return {
    read: async (): Promise<StoredSlackConnection | null> => {
      const [row] = await orm().select(columns).from(slackConnection);
      return row ?? null;
    },

    /** Like `read`, and locks the row until the transaction ends. */
    lock: async (): Promise<StoredSlackConnection | null> => {
      const [row] = await orm().select(columns).from(slackConnection).for("update");
      return row ?? null;
    },

    save: async (connection: StoredSlackConnection): Promise<void> => {
      await orm()
        .insert(slackConnection)
        .values(connection)
        .onConflictDoUpdate({
          target: slackConnection.id,
          set: { ...connection, connectedAt: new Date() },
        });
    },
  };
}

const columns = {
  teamId: slackConnection.teamId,
  teamName: slackConnection.teamName,
  encryptedToken: slackConnection.encryptedToken,
};
