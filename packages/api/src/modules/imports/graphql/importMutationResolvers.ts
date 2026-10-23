import { invalidInput } from "../../../core/applicationError";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type { ImportUseCases } from "../app";
import type { ValueChoice } from "../domain";
import { AI_SOURCES, FIELDS, IMPORT, INCOMPLETE_REASONS, keyOf } from "./graphqlValues";

/** The import's mutations; each answers with the import, or a payload error it expects. */
export function importMutationResolvers(useCases: ImportUseCases): Resolvers["Mutation"] {
  return {
    readSlackIntoImport: (_parent, _args, context) =>
      mutationPayload<ResolversTypes["ImportReadSlackPayload"]>(
        "import",
        () => thenImport(useCases.readSlack(context.getActor())),
        ["UNAVAILABLE"],
      ),
    startDemo: (_parent, _args, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
        thenImport(useCases.startDemo(context.getActor())),
      ),
    approveImport: (_parent, { version }, context) =>
      mutationPayload<ResolversTypes["ImportApprovePayload"]>(
        "import",
        () => thenImport(useCases.approveImport(context.getActor(), version)),
        ["CONFLICT"],
      ),
    resetSetup: (_parent, _args, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
        thenImport(useCases.resetSetup(context.getActor())),
      ),
    retryImportFile: (_parent, { sourceId }, context) =>
      mutationPayload<ResolversTypes["ImportRetryFilePayload"]>(
        "import",
        () => thenImport(useCases.files.retryFile(context.getActor(), sourceId)),
        ["CONFLICT"],
      ),
    allowOriginalFileRead: (_parent, { sourceId, aiSource }, context) =>
      mutationPayload<ResolversTypes["ImportAllowOriginalFileReadPayload"]>(
        "import",
        () =>
          thenImport(
            useCases.originalFileReads.allowOriginalFileRead(
              context.getActor(),
              sourceId,
              aiSource ? keyOf(AI_SOURCES, aiSource) : null,
            ),
          ),
        ["CONFLICT"],
      ),
    removeImportSource: (_parent, { sourceId }, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
        thenImport(useCases.removeSource(context.getActor(), sourceId)),
      ),
    chooseImportEmployeeValue: (_parent, { input }, context) =>
      mutationPayload<ResolversTypes["ImportChooseEmployeeValuePayload"]>(
        "import",
        () =>
          thenImport(
            useCases.choices.chooseEmployeeValue(context.getActor(), {
              key: input.employeeId,
              field: keyOf(FIELDS, input.field),
              choice: valueChoiceOf(input),
            }),
          ),
        ["INVALID_INPUT"],
      ),
    chooseImportSourceForAll: (_parent, { field, sourceId }, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
        thenImport(
          useCases.choices.chooseSourceForAll(context.getActor(), {
            field: keyOf(FIELDS, field),
            sourceId,
          }),
        ),
      ),
    setImportEmployeeLeftOut: (_parent, { employeeId, leftOut }, context) =>
      mutationPayload<ResolversTypes["ImportSetEmployeeLeftOutPayload"]>(
        "import",
        () =>
          thenImport(useCases.choices.setLeftOut(context.getActor(), { key: employeeId, leftOut })),
        ["INVALID_INPUT"],
      ),
    leaveOutIncompleteImportEmployees: (_parent, { reason }, context) =>
      mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
        thenImport(
          useCases.choices.leaveOutIncomplete(context.getActor(), {
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

/** The import, once a use case that returns nothing has finished. */
async function thenImport(work: Promise<void>): Promise<typeof IMPORT> {
  await work;
  return IMPORT;
}
