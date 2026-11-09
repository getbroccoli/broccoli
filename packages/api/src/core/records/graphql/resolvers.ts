import DataLoader from "dataloader";

import {
  type GraphqlContext,
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
} from "../../graphql";
import {
  type LoadedRecord,
  type RecordCloneService,
  type RecordHistoryReaderService,
  type RecordTypeRegistry,
  type VisibleFieldChange,
} from "../app";
import type { HistoryLine, RecordType } from "../domain";

export function createResolvers(
  registry: RecordTypeRegistry,
  reader: RecordHistoryReaderService,
  cloner: RecordCloneService,
): Resolvers {
  const authorEmails = perRequest(
    () =>
      new DataLoader<string, string | null>(async (userIds) => {
        const emails = await reader.readAuthorEmails(userIds);
        return userIds.map((userId) => emails.get(userId) ?? null);
      }),
  );
  const records = perRequest(
    (context) =>
      new DataLoader<HistoryLine, LoadedRecord | null, string>(
        (lines) => loadRecords(reader, context, lines),
        { cacheKeyFn: keyOf },
      ),
  );
  // Every line that leaves the API, from a history page or a mutation, hides what its reader may not see.
  const visibleChanges = perRequest(
    (context) =>
      new DataLoader<HistoryLine, VisibleFieldChange[], string>(
        async (lines) =>
          (await reader.hideOutOfScopeReferences(context.getActor(), lines)).map(
            ({ changes }) => changes,
          ),
        { cacheKeyFn: (line) => line.id },
      ),
  );
  return {
    ...accessResolvers(registry, reader),
    Query: {
      recordHistory: (_parent, { recordType, recordId, first, after }, context) =>
        reader.readHistory(context.getActor(), recordType.toLowerCase() as RecordType, recordId, {
          first: first ?? undefined,
          after,
        }),
    },
    Mutation: {
      records: () => ({}),
    },
    RecordsMutations: {
      clone: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["RecordClonePayload"]>(
          async () => ({
            clone: await cloner.cloneRecord(context.getActor(), {
              ...input,
              recordType: input.recordType.toLowerCase() as RecordType,
            }),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
    },
    RecordChange: {
      record: (line, _args, context) => records(context).load(line),
      changes: (line, _args, context) => visibleChanges(context).load(line),
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

/**
 * `AnyRecord.access` on each registered type, one read per type and request however many
 * records a list holds; core cannot name the types statically.
 */
function accessResolvers(
  registry: RecordTypeRegistry,
  reader: RecordHistoryReaderService,
): Resolvers {
  return Object.fromEntries(
    Object.entries(registry).map(([recordType, registration]) => {
      const access = perRequest(
        (context) =>
          new DataLoader(async (ids: readonly string[]) => {
            const found = await reader.readAccess(
              context.getActor(),
              recordType as RecordType,
              ids,
            );
            return ids.map((id) => found.get(id)!);
          }),
      );
      return [
        registration.graphqlType,
        {
          access: (record: { id: string }, _args: unknown, context: GraphqlContext) =>
            access(context).load(record.id),
        },
      ];
    }),
  );
}

/** The records the lines are about, in their order: one query per record type, not one per line. */
async function loadRecords(
  reader: RecordHistoryReaderService,
  context: GraphqlContext,
  lines: readonly HistoryLine[],
): Promise<(LoadedRecord | null)[]> {
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
}

function keyOf({ recordType, recordId }: Pick<HistoryLine, "recordType" | "recordId">): string {
  return `${recordType}:${recordId}`;
}

/** The GraphQL types that implement `AnyRecord`, as the generated resolver types list them. */
type AnyRecordTypeName = Extract<
  Awaited<ReturnType<NonNullable<NonNullable<Resolvers["AnyRecord"]>["__resolveType"]>>>,
  string
>;
