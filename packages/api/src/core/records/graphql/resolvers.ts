import DataLoader from "dataloader";

import type { Orm } from "../../db";
import { type GraphqlContext, perRequest, type Resolvers } from "../../graphql";
import {
  type LoadedRecord,
  readAuthorEmails,
  readRecordAccess,
  type RecordHistoryReader,
  type RecordTypeRegistry,
} from "../app";
import type { HistoryLine, RecordType } from "../domain";

export function createResolvers(
  orm: Orm,
  registry: RecordTypeRegistry,
  reader: RecordHistoryReader,
): Resolvers {
  const authorEmails = perRequest(
    () =>
      new DataLoader<string, string | null>(async (userIds) => {
        const emails = await readAuthorEmails(orm, userIds);
        return userIds.map((userId) => emails.get(userId) ?? null);
      }),
  );
  // One query per record type a request's lines are about, not one per line.
  const records = perRequest(
    (context) =>
      new DataLoader<HistoryLine, LoadedRecord | null, string>(
        async (lines) => {
          const idsByType = Map.groupBy(lines, (line) => line.recordType);
          const loaded = new Map<string, LoadedRecord>();
          for (const [recordType, ofType] of idsByType) {
            const found = await reader.readRecords(
              context.getActor(),
              recordType,
              ofType.map((line) => line.recordId),
            );
            for (const [id, record] of found) loaded.set(`${recordType}:${id}`, record);
          }
          return lines.map((line) => loaded.get(keyOf(line)) ?? null);
        },
        { cacheKeyFn: keyOf },
      ),
  );
  // `AnyRecord.access` on each registered type; core cannot name the types statically.
  // shortcut: a report-scoped caller reads the reporting line once per record; batch it when a
  // list selects `access`.
  const accessResolvers = Object.fromEntries(
    Object.values(registry).map((registration) => [
      registration.graphqlType,
      {
        access: (record: { id: string }, _args: unknown, context: GraphqlContext) =>
          readRecordAccess(context.getActor(), registration, record.id),
      },
    ]),
  ) as Resolvers;
  return {
    ...accessResolvers,
    Query: {
      recordHistory: (_parent, { recordType, recordId, first, after }, context) =>
        reader.readHistory(context.getActor(), recordType.toLowerCase() as RecordType, recordId, {
          first: first ?? undefined,
          after,
        }),
    },
    RecordChange: {
      record: (line, _args, context) => records(context).load(line),
    },
    AnyRecord: {
      // A module names its GraphQL type in its registration; core cannot list them statically.
      __resolveType: (record) => record.__typename as AnyRecordTypeName,
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

function keyOf({ recordType, recordId }: Pick<HistoryLine, "recordType" | "recordId">): string {
  return `${recordType}:${recordId}`;
}

/** The GraphQL types that implement `AnyRecord`, as the generated resolver types list them. */
type AnyRecordTypeName = Extract<
  Awaited<ReturnType<NonNullable<NonNullable<Resolvers["AnyRecord"]>["__resolveType"]>>>,
  string
>;
