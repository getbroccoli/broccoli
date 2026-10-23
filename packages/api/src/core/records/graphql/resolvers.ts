import DataLoader from "dataloader";

import type { Orm } from "../../db";
import { perRequest, type Resolvers } from "../../graphql";
import { readAuthorEmails, type RecordHistoryReader } from "../app";
import type { RecordType } from "../domain";

export function createResolvers(orm: Orm, reader: RecordHistoryReader): Resolvers {
  const authorEmails = perRequest(
    () =>
      new DataLoader<string, string | null>(async (userIds) => {
        const emails = await readAuthorEmails(orm, userIds);
        return userIds.map((userId) => emails.get(userId) ?? null);
      }),
  );
  return {
    Query: {
      recordHistory: (_parent, { recordType, recordId, first, after }, context) =>
        reader.readHistory(context.getActor(), recordType.toLowerCase() as RecordType, recordId, {
          first: first ?? undefined,
          after,
        }),
    },
    RecordChangeAuthor: {
      userId: (author) => (author.kind === "SIGNED_IN_USER" ? author.id : null),
      email: (author, _args, context) =>
        author.kind === "SIGNED_IN_USER" && author.id
          ? authorEmails(context).load(author.id)
          : null,
    },
  };
}
