import { invalidInput } from "../../../core/applicationError";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { ImportServices } from "../app";
import type { ValueChoice } from "../domain";
import { AI_SOURCES, FIELDS, IMPORT, INCOMPLETE_REASONS, keyOf } from "./graphqlValues";

/** The import's mutations; each answers with the import, or a payload error it expects. */
export function importMutationResolvers(services: ImportServices): Resolvers["ImportMutations"] {
  return {
    readSlack: (_parent, _args, context) =>
      mutationPayload<ResolversTypes["ImportReadSlackPayload"]>(
        () => thenImportPayload(services.readSlack(context.getActor())),
        ["UNAVAILABLE"],
      ),
    startDemo: (_parent, _args, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>(() =>
        thenImportPayload(services.startDemo(context.getActor())),
      ),
    approve: (_parent, { version }, context) =>
      mutationPayload<ResolversTypes["ImportApprovePayload"]>(
        () => thenImportPayload(services.approveImport(context.getActor(), version)),
        ["CONFLICT"],
      ),
    reopenReview: (_parent, _args, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>(() =>
        thenImportPayload(services.reopenReview(context.getActor())),
      ),
    retryFile: (_parent, { sourceId }, context) =>
      mutationPayload<ResolversTypes["ImportRetryFilePayload"]>(
        () => thenImportPayload(services.files.retryFile(context.getActor(), sourceId)),
        ["CONFLICT"],
      ),
    allowOriginalFileRead: (_parent, { sourceId, aiSource }, context) =>
      mutationPayload<ResolversTypes["ImportAllowOriginalFileReadPayload"]>(
        () =>
          thenImportPayload(
            services.originalFileReads.allowOriginalFileRead(
              context.getActor(),
              sourceId,
              aiSource ? keyOf(AI_SOURCES, aiSource) : null,
            ),
          ),
        ["CONFLICT"],
      ),
    removeSource: (_parent, { sourceId }, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>(() =>
        thenImportPayload(services.removeSource(context.getActor(), sourceId)),
      ),
    chooseEmployeeValue: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["ImportChooseEmployeeValuePayload"]>(
        () =>
          thenImportPayload(
            services.choices.chooseEmployeeValue(context.getActor(), {
              key: input.employeeId,
              field: keyOf(FIELDS, input.field),
              choice: valueChoiceOf(input),
            }),
          ),
        ["INVALID_INPUT"],
      ),
    chooseSourceForAll: (_parent, { field, sourceId }, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>(() =>
        thenImportPayload(
          services.choices.chooseSourceForAll(context.getActor(), {
            field: keyOf(FIELDS, field),
            sourceId,
          }),
        ),
      ),
    setEmployeeLeftOut: (_parent, { employeeId, leftOut }, context) =>
      mutationPayload<ResolversTypes["ImportSetEmployeeLeftOutPayload"]>(
        () =>
          thenImportPayload(
            services.choices.setLeftOut(context.getActor(), { key: employeeId, leftOut }),
          ),
        ["INVALID_INPUT"],
      ),
    chooseEmployeeManager: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["ImportChooseEmployeeManagerPayload"]>(
        () =>
          thenImportPayload(
            services.choices.chooseManager(context.getActor(), {
              keys: input.employeeIds,
              managerKey: input.managerId ?? null,
            }),
          ),
        ["INVALID_INPUT"],
      ),
    leaveOutIncomplete: (_parent, { reason }, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>(() =>
        thenImportPayload(
          services.choices.leaveOutIncomplete(context.getActor(), {
            reason: keyOf(INCOMPLETE_REASONS, reason),
          }),
        ),
      ),
  };
}

/** A record's value or a typed one; with neither, null clears the choice. Both are refused. */
function valueChoiceOf({
  recordId,
  value,
}: {
  recordId?: string | null;
  value?: string | null;
}): ValueChoice | null {
  if (recordId != null && value != null) {
    throw invalidInput([{ field: "value", code: "conflicts_with_record" }]);
  }
  if (recordId != null) {
    return { recordId };
  }
  return value != null ? { value } : null;
}

/** The import payload, once a use case that returns nothing has finished. */
async function thenImportPayload(work: Promise<void>): Promise<{ import: typeof IMPORT }> {
  await work;
  return { import: IMPORT };
}
