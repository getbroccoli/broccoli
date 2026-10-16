import { invalidInput } from "../../../core/applicationError";
import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import { incompleteReason, type ImportUseCases } from "../app";
import {
  hasOpenConflict,
  type ImportEmployee,
  type ImportEmployeeField,
  type ValueChoice,
} from "../domain";
import { importLoaders } from "./loaders";

const IMPORT = {};
const KINDS = { slack: "SLACK", file: "FILE" } as const;
const STATUSES = { mapping: "MAPPING", mapped: "MAPPED", failed: "FAILED" } as const;
const FAILURES = {
  no_people_columns: "NO_PEOPLE_COLUMNS",
  unavailable: "UNAVAILABLE",
} as const;
const INCOMPLETE_REASONS = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "EMAIL",
  other: "OTHER",
} as const;
const FIELDS = {
  firstName: "FIRST_NAME",
  lastName: "LAST_NAME",
  email: "EMAIL",
  jobTitle: "JOB_TITLE",
  startDate: "START_DATE",
} as const;
const CHOICES = { default: "DEFAULT", picked: "PICKED", typed: "TYPED" } as const;
const CHECK_KINDS = { conflict: "CONFLICT", incomplete: "INCOMPLETE" } as const;

export function createResolvers(useCases: ImportUseCases): Resolvers {
  const loaders = importLoaders(useCases);
  return {
    Query: {
      import: () => IMPORT,
    },
    Mutation: {
      import: () => ({}),
    },
    ImportMutations: {
      readSlack: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["ImportReadSlackPayload"]>(
          "import",
          () => thenImport(useCases.readSlack(context.getActor())),
          ["UNAVAILABLE"],
        ),
      skip: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
          thenImport(useCases.skipImport(context.getActor())),
        ),
      approve: (_parent, _args, context) =>
        mutationPayload<ResolversTypes["ImportApprovePayload"]>(
          "import",
          () => thenImport(useCases.approveImport(context.getActor())),
          ["CONFLICT"],
        ),
      retryFile: (_parent, { sourceId }, context) =>
        mutationPayload<ResolversTypes["ImportRetryFilePayload"]>(
          "import",
          () => thenImport(useCases.files.retryFile(context.getActor(), sourceId)),
          ["CONFLICT"],
        ),
      removeFile: (_parent, { sourceId }, context) =>
        mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
          thenImport(useCases.files.removeFile(context.getActor(), sourceId)),
        ),
      chooseEmployeeValue: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["ImportChooseEmployeeValuePayload"]>(
          "import",
          () =>
            thenImport(
              useCases.choices.chooseEmployeeValue(context.getActor(), {
                key: input.employeeId,
                field: fieldOf(input.field),
                choice: valueChoiceOf(input),
              }),
            ),
          ["INVALID_INPUT"],
        ),
      chooseSourceForAll: (_parent, { field, sourceId }, context) =>
        mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
          thenImport(
            useCases.choices.chooseSourceForAll(context.getActor(), {
              field: fieldOf(field),
              sourceId,
            }),
          ),
        ),
      setEmployeeLeftOut: (_parent, { employeeId, leftOut }, context) =>
        mutationPayload<ResolversTypes["ImportSetEmployeeLeftOutPayload"]>(
          "import",
          () =>
            thenImport(
              useCases.choices.setLeftOut(context.getActor(), { key: employeeId, leftOut }),
            ),
          ["INVALID_INPUT"],
        ),
      leaveOutIncomplete: (_parent, { reason }, context) =>
        mutationPayload<ResolversTypes["ImportMutationPayload"]>("import", () =>
          thenImport(
            useCases.choices.leaveOutIncomplete(context.getActor(), {
              reason: keyOf(INCOMPLETE_REASONS, reason),
            }),
          ),
        ),
    },
    Import: {
      id: () => "import",
      sources: (_parent, _args, context) => useCases.reads.listSources(context.getActor()),
      employees: (_parent, { first, after, orderBy, filter }, context) =>
        useCases.reads.listEmployees(context.getActor(), {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        }),
      employeeCount: (_parent, _args, context) => useCases.reads.employeeCount(context.getActor()),
      readyEmployeeCount: (_parent, _args, context) =>
        useCases.reads.readyEmployeeCount(context.getActor()),
      checks: (_parent, _args, context) => useCases.reads.listChecks(context.getActor()),
      canReadFiles: (_parent, _args, context) => useCases.files.canReadFiles(context.getActor()),
    },
    ImportSource: {
      kind: ({ kind }) => KINDS[kind],
      status: ({ status }) => STATUSES[status],
      failure: ({ failure }) => (failure ? FAILURES[failure] : null),
      employeeCount: ({ id }, _args, context) => loaders(context).employeeCount.load(id),
      records: ({ id }, { first, after }, context) =>
        useCases.reads.listEmployeeRecords(context.getActor(), {
          first: first ?? undefined,
          after,
          sourceId: id,
        }),
    },
    ImportEmployee: {
      id: ({ key }) => key,
      firstName: (employee) => employeeValue(employee, "firstName"),
      lastName: (employee) => employeeValue(employee, "lastName"),
      email: (employee) => employeeValue(employee, "email"),
      jobTitle: (employee) => employeeValue(employee, "jobTitle"),
      startDate: (employee) => employeeValue(employee, "startDate"),
      incompleteReason: (employee) => {
        const reason = incompleteReason(employee);
        return reason ? INCOMPLETE_REASONS[reason] : null;
      },
    },
    ImportEmployeeRecord: {
      source: ({ sourceId }, _args, context) => loaders(context).source.load(sourceId),
    },
    ImportCheck: {
      kind: ({ kind }) => CHECK_KINDS[kind],
      field: (check) => (check.kind === "conflict" ? FIELDS[check.field] : null),
      reason: (check) => (check.kind === "incomplete" ? INCOMPLETE_REASONS[check.reason] : null),
      sources: (check, _args, context) =>
        check.kind === "conflict"
          ? Promise.all(check.sourceIds.map((id) => loaders(context).source.load(id)))
          : [],
    },
  };
}

/** One field of an import employee, with the records behind each of its values. */
function employeeValue({ records, values }: ImportEmployee, field: ImportEmployeeField) {
  const { value, choice, options } = values[field];
  return {
    value,
    choice: CHOICES[choice],
    conflict: hasOpenConflict(values[field]),
    options: options.map((option) => ({
      value: option.value,
      records: records.filter(({ id }) => option.recordIds.includes(id)),
    })),
  };
}

function fieldOf(field: (typeof FIELDS)[ImportEmployeeField]): ImportEmployeeField {
  return keyOf(FIELDS, field);
}

/** The domain name behind a GraphQL enum value. */
function keyOf<K extends string, V extends string>(names: Record<K, V>, value: V): K {
  return (Object.keys(names) as K[]).find((key) => names[key] === value)!;
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

/** The import, once a use case that returns nothing has finished; its fields load what the client selects. */
async function thenImport(work: Promise<void>): Promise<typeof IMPORT> {
  await work;
  return IMPORT;
}
