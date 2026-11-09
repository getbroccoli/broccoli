import {
  type GraphqlContext,
  mutationPayload,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import { parseUuid } from "../../../utils";
import type {
  EmployeeReadService,
  EmployeeTermsService,
  EmployeeWorkingPatternService,
  OwnWorkingWeekService,
  TermsChange,
} from "../app";
import { type Employee, parseDateField } from "../domain";

/** Moving people to other terms and a person's own working week, with the preview of a move. */
export function employmentTermsResolvers(
  services: EmployeeReadService &
    EmployeeWorkingPatternService &
    EmployeeTermsService &
    OwnWorkingWeekService,
) {
  /** An own-week change's payload: the person afterwards, or why it was refused. */
  const ownWeekPayload = (
    context: GraphqlContext,
    employeeId: string,
    change: () => Promise<void>,
  ) =>
    mutationPayload<ResolversTypes["EmployeeOwnWorkingWeekPayload"]>(async () => {
      await change();
      return { employee: await services.readEmployee(context.getActor(), employeeId) };
    }, ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"]);
  return {
    Query: {
      async termsChangePreview(_parent, { input }, context) {
        const actor = context.getActor();
        const { moved, skipped } = await services.previewTermsChange(actor, input);
        // Checked by the preview already; in their canonical form, as saving reads them.
        const from = parseDateField("startDate", input.startDate);
        const move = { termsId: parseUuid(input.termsId)!, startDate: from };
        const ids = moved.map(({ employeeId }) => employeeId);
        // Both read from the move's date, so a past one compares the rules on that date.
        const after = await services.readEmploymentTerms(actor, { employeeIds: ids, move, from });
        const now = await services.readEmploymentTerms(actor, { employeeIds: ids, from });
        const employees = await services.readEmployees(actor, [
          ...ids,
          ...skipped.map(({ employeeId }) => employeeId),
        ]);
        return {
          moves: moved.map(({ employeeId, startDate }) => ({
            employee: employees.get(employeeId)!,
            startDate,
            employmentTerms: { ...after.get(employeeId)!, move, from },
            currentTerms: { ...now.get(employeeId)!, from },
          })),
          skipped: skippedOf(skipped, employees),
        };
      },
    },
    EmployeesMutations: {
      changeTerms: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeTermsChangePayload"]>(async () => {
          const actor = context.getActor();
          const { moved, skipped } = await services.changeTerms(actor, input);
          const employees = await services.readEmployees(actor, input.employeeIds);
          return {
            moved: moved.map(({ employeeId, startDate }) => ({
              employee: employees.get(employeeId)!,
              startDate,
            })),
            skipped: skippedOf(skipped, employees),
          };
        }, ["INVALID_INPUT", "NOT_FOUND"]),
      cancelTermsChange: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeTermsCancelChangePayload"]>(async () => {
          await services.cancelTermsChange(context.getActor(), input);
          return { employee: await services.readEmployee(context.getActor(), input.employeeId) };
        }, ["NOT_FOUND", "CONFLICT"]),
      setOwnWorkingWeek: (_parent, { input }, context) =>
        ownWeekPayload(context, input.employeeId, () =>
          services.setOwnWorkingWeek(context.getActor(), {
            employeeId: input.employeeId,
            startDate: input.startDate,
            minutes: [
              input.mondayMinutes,
              input.tuesdayMinutes,
              input.wednesdayMinutes,
              input.thursdayMinutes,
              input.fridayMinutes,
              input.saturdayMinutes,
              input.sundayMinutes,
            ],
            bankHolidayCalendar: input.bankHolidayCalendar.toLowerCase(),
          }),
        ),
      useTermsWorkingWeek: (_parent, { input }, context) =>
        ownWeekPayload(context, input.employeeId, () =>
          services.useTermsWorkingWeek(context.getActor(), input),
        ),
      cancelOwnWorkingWeekChange: (_parent, { input }, context) =>
        ownWeekPayload(context, input.employeeId, () =>
          services.cancelOwnWorkingWeekChange(context.getActor(), input),
        ),
    },
  } satisfies Resolvers;
}

/** Skipped people as GraphQL reads them, with their employee. */
function skippedOf(
  skipped: TermsChange["skipped"],
  employees: Map<string, Employee>,
): { employee: Employee; reason: Uppercase<TermsChange["skipped"][number]["reason"]> }[] {
  return skipped.map(({ employeeId, reason }) => ({
    employee: employees.get(employeeId)!,
    reason: toEnum(reason),
  }));
}
