import DataLoader from "dataloader";

import {
  mutationPayload,
  perRequest,
  type Resolvers,
  type ResolversTypes,
  toEnum,
} from "../../../core/graphql";
import type {
  BookTimeOffService,
  PersonTimeOff,
  TimeOffPolicyService,
  TimeOffSetupService,
  TimeOffService,
  TimeOffWithPolicies,
  WhosOutService,
} from "../app";
import {
  type PolicyVersion,
  type TimeOffTypeColour,
  type TimeOffTypeIdentityInput,
  type TimeOffTypeIcon,
} from "../domain";
import type { CalendarDate } from "../../../utils";
import { bookingResolvers } from "./bookingResolvers";
import { BALANCE_KINDS, toGraphqlType } from "./graphqlValues";
import { ownRulesResolvers, type OwnRulesServices } from "./ownRulesResolvers";
import { toStoredRules } from "./storedRules";
import { previewTimeOffLoader } from "./previewTimeOffLoader";

type TimeOffTypeRow = ResolversTypes["EmployeeTimeOffType"];

export function createResolvers(
  timeOff: TimeOffService,
  timeOffSetup: TimeOffSetupService,
  policies: TimeOffPolicyService,
  booking: BookTimeOffService,
  whosOut: WhosOutService,
  ownRules: OwnRulesServices,
): Resolvers {
  const bookings = bookingResolvers(booking, whosOut);
  const loaders = timeOffLoaders(timeOff);
  return {
    ...bookings,
    Query: {
      ...bookings.Query,
      timeOffSettings: async (_parent, _args, context) => {
        const list = await timeOff.listTimeOffTypes(context.getActor());
        return {
          peopleWithTimeOff: list.peopleWithTimeOff,
          timeOffTypes: list.timeOffTypes.map((row) => ({
            ...row,
            timeOffType: toGraphqlType(row.timeOffType),
            balance: toBalanceKind(row.balance),
          })),
        };
      },
      timeOffSetup: async (_parent, _args, context) => {
        const setup = await timeOffSetup.readTimeOffSetup(context.getActor());
        return {
          annualLeavePolicies: setup.annualLeavePolicies.map(({ key, ...policy }) => ({
            ...policy,
            key: toEnum(key),
          })),
          bankHolidayCalendars: setup.bankHolidayCalendars.map(({ calendar, countThisYear }) => ({
            calendar: toEnum(calendar),
            countThisYear,
          })),
        };
      },
      locationCalendarSuggestions: async (_parent, { locationNames }, context) =>
        (await timeOffSetup.suggestLocationCalendars(context.getActor(), { locationNames })).map(
          (suggestion) => ({
            ...suggestion,
            bankHolidayCalendar: toEnum(suggestion.bankHolidayCalendar),
          }),
        ),
    },
    Mutation: {
      timeOff: () => ({}),
    },
    TimeOffMutations: {
      ...bookings.TimeOffMutations,
      createType: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeCreatePayload"]>(
          async () => ({
            timeOffType: toGraphqlType(
              await timeOff.createType(context.getActor(), toIdentity(input)),
            ),
          }),
          ["INVALID_INPUT"],
        ),
      changeType: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeChangePayload"]>(
          async () => ({
            timeOffType: toGraphqlType(
              await timeOff.changeType(context.getActor(), {
                id: input.timeOffTypeId,
                ...toIdentity(input),
              }),
            ),
          }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      deleteType: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffTypeDeletePayload"]>(async () => {
          await timeOff.deleteType(context.getActor(), { id: input.timeOffTypeId });
          return { deletedTimeOffTypeId: input.timeOffTypeId };
        }, ["NOT_FOUND", "CONFLICT"]),
      saveTimeOffPolicy: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicySavePayload"]>(
          async () => ({
            rules: await policies.saveTimeOffPolicy(context.getActor(), {
              ...input,
              rules: toStoredRules(input.rules),
            }),
          }),
          ["INVALID_INPUT"],
        ),
      discardTimeOffPolicy: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyDiscardPayload"]>(async () => {
          await policies.discardTimeOffPolicy(context.getActor(), input);
          return { discardedVersionId: input.versionId };
        }, ["NOT_FOUND"]),
      saveTimeOffStop: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicySavePayload"]>(async () => {
          return { rules: await policies.saveTimeOffStop(context.getActor(), input) };
        }, ["INVALID_INPUT"]),
      cancelPolicyChange: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyCancelChangePayload"]>(async () => {
          await policies.cancelPolicyChange(context.getActor(), input);
          return { cancelledAssignmentId: input.assignmentId };
        }, ["NOT_FOUND", "CONFLICT"]),
      cancelPolicyStop: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TimeOffPolicyCancelStopPayload"]>(async () => {
          await policies.cancelPolicyStop(context.getActor(), input);
          return { reopenedAssignmentId: input.assignmentId };
        }, ["NOT_FOUND", "CONFLICT"]),
      publishTerms: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TermsPublishPayload"]>(async () => {
          return { terms: await policies.publishTerms(context.getActor(), input) };
        }, ["INVALID_INPUT", "CONFLICT"]),
      ...ownRulesResolvers(ownRules),
    },
    Employee: {
      timeOffTypes: (employee, _args, context) => loaders(context).timeOffTypes.load(employee.id),
      ...bookings.Employee,
    },
    EmployeeEmploymentTerms: {
      timeOff: ({ employeeId, move, from }, args, context) => {
        // The Date scalar has checked the argument.
        const date = from ?? (args.from as CalendarDate | null | undefined);
        return date
          ? loaders(context).previewTimeOff.load({ employeeId, move, from: date })
          : loaders(context).personTimeOff.load(employeeId);
      },
    },
    PersonTimeOff: {
      timeOffType: ({ timeOffType }) => toGraphqlType(timeOffType),
      versions: ({ versions }) =>
        versions.map(({ source, startDate, endDate, version }) => ({
          source: toEnum(source),
          startDate,
          endDate,
          rules: { ...toGraphqlRules(version), id: version.id, startDate, endDate },
        })),
    },
    Terms: {
      timeOff: async (terms, { timeOffTypeId }, context) => {
        const rows = await loaders(context).termsTimeOff.load(terms.id);
        return timeOffTypeId
          ? rows.filter(({ timeOffType }) => timeOffType.id === timeOffTypeId)
          : rows;
      },
      hasUnpublishedChanges: async (terms, _args, context) =>
        terms.unpublishedWorkingWeek !== null ||
        (await loaders(context).termsTimeOff.load(terms.id)).some(
          ({ unpublished }) => unpublished !== null,
        ),
      publishSuggestions: async (terms, { from }, context) => {
        const suggestions = await policies.readPublishSuggestions(context.getActor(), {
          termsId: terms.id,
          from,
        });
        return {
          versions: suggestions.versions,
          owners: suggestions.owners.map(({ owner, ...rest }) => ({
            ...rest,
            termsId: "termsId" in owner ? owner.termsId : null,
            employeeId: "employeeId" in owner ? owner.employeeId : null,
          })),
        };
      },
    },
    TimeOffWithPolicies: {
      timeOffType: ({ timeOffType }) => toGraphqlType(timeOffType),
      versions: ({ versions }) =>
        versions.map(({ id, startDate, endDate, version }) => ({
          ...toGraphqlRules(version),
          id,
          startDate,
          endDate,
        })),
      unpublished: ({ unpublished }) => unpublished,
    },
    UnpublishedTimeOffRules: {
      balance: ({ balance }) => BALANCE_KINDS[balance],
      bankHolidays: ({ bankHolidays }) => bankHolidays && toEnum(bankHolidays),
      leaveYearStart: (version) => toGraphqlRules(version).leaveYearStart,
      yearlyEntitlement: (version) => toGraphqlRules(version).yearlyEntitlement,
    },
  };
}

/** Per-request loaders batching each person's or terms' time off reads. */
function timeOffLoaders(timeOff: TimeOffService) {
  return perRequest((context) => ({
    timeOffTypes: new DataLoader<string, TimeOffTypeRow[] | null>(async (employeeIds) => {
      const read = await timeOff.readTimeOffTypes(context.getActor(), { employeeIds });
      return employeeIds.map(
        (id) =>
          read.get(id)?.map((row) => ({
            ...row,
            timeOffType: toGraphqlType(row.timeOffType),
            balance: BALANCE_KINDS[row.balance],
          })) ?? null,
      );
    }),
    personTimeOff: new DataLoader<string, PersonTimeOff[] | null>(async (employeeIds) => {
      const read = await timeOff.readPersonTimeOff(context.getActor(), { employeeIds });
      return employeeIds.map((id) => read.get(id) ?? null);
    }),
    previewTimeOff: previewTimeOffLoader(timeOff, context),
    termsTimeOff: new DataLoader<string, TimeOffWithPolicies[]>(async (termsIds) => {
      const read = await timeOff.readTermsTimeOff(context.getActor(), termsIds);
      return termsIds.map((id) => read.get(id)!);
    }),
  }));
}

/** A type's identity from GraphQL input, its enums in the stored lower case. */
function toIdentity(
  input: ResolversTypes["TimeOffTypeCreateInput"] | ResolversTypes["TimeOffTypeChangeInput"],
): TimeOffTypeIdentityInput {
  return {
    name: input.name,
    icon: input.icon.toLowerCase() as TimeOffTypeIcon,
    colour: input.colour.toLowerCase() as TimeOffTypeColour,
    private: input.private,
    defaultRules: toStoredRules(input.defaultRules),
  };
}

/** A policy version's rules as GraphQL shows them: its yearly allowance from its rules, enums in capitals. */
function toGraphqlRules(version: PolicyVersion) {
  const yearly = version.rules.find((rule) => rule.kind === "yearly_entitlement");
  return {
    balance: BALANCE_KINDS[version.balance],
    bankHolidays: version.bankHolidays && toEnum(version.bankHolidays),
    leaveYearStart: version.leaveYear && {
      kind: toEnum(version.leaveYear.kind),
      month:
        version.leaveYear.kind === "leave_year_from_fixed_date" ? version.leaveYear.month : null,
      day: version.leaveYear.kind === "leave_year_from_fixed_date" ? version.leaveYear.day : null,
    },
    yearlyEntitlement: yearly
      ? { days: yearly.entitlementDays, daysPerWeek: yearly.entitlementDaysPerWeek }
      : null,
  };
}

/** Rules sent through GraphQL as the service takes them: enum values in lower case. */

function toBalanceKind(balance: PolicyVersion["balance"] | null) {
  return balance && BALANCE_KINDS[balance];
}

/** A person as a preview reads them: from a date, and maybe as if after a move. */
