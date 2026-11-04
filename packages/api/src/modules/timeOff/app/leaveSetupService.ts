import type { Orm } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import type { SecurityContext } from "../../../core/security";
import { type Decisions, DecisionsError } from "../../../integrations/ai";
import { type CalendarDate, todayInLondon } from "../../../utils";
import {
  BANK_HOLIDAY_CALENDARS,
  type BankHolidayCalendar,
  type BankHolidayService,
} from "../../bankHolidays";
import { timeOffPolicyRepository } from "../db";
import type { StandardLeavePolicyKey } from "../domain";

/** What the Set up leave page offers. */
export interface LeaveSetup {
  /** The standard Annual leave policies, the UK statutory minimum first. */
  annualLeavePolicies: { id: string; name: string }[];
  /** Each nation's bank holidays this year (London). */
  bankHolidayCalendars: { calendar: BankHolidayCalendar; countThisYear: number }[];
}

/** Jev's guess of whose bank holidays apply at a location; unsure ones fall back to England and Wales. */
export interface LocationCalendarSuggestion {
  locationName: string;
  bankHolidayCalendar: BankHolidayCalendar;
  unsure: boolean;
}

/** The choices of the Set up leave page, and Jev's suggestion for each location. Admins only. */
export interface LeaveSetupService {
  readLeaveSetup: (ctx: SecurityContext) => Promise<LeaveSetup>;
  /**
   * Asks Jev, with the location names only, whose bank holidays apply at each location, in the
   * order given. Never fails: without an answer a location is England and Wales, unsure.
   */
  suggestLocationCalendars: (
    ctx: SecurityContext,
    input: { locationNames: readonly string[] },
  ) => Promise<LocationCalendarSuggestion[]>;
}

export function createLeaveSetupService({
  orm,
  logger,
  decisions,
  bankHolidays,
  today = todayInLondon,
}: {
  orm: Orm;
  logger: Logger;
  decisions: Decisions;
  bankHolidays: BankHolidayService;
  today?: () => CalendarDate;
}): LeaveSetupService {
  return {
    async readLeaveSetup(ctx) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const policies = await timeOffPolicyRepository(orm).findAll();
      const year = today().slice(0, 4);
      const holidays = await bankHolidays.readBankHolidays(ctx, {
        calendars: BANK_HOLIDAY_CALENDARS,
        from: `${year}-01-01`,
        until: `${year}-12-31`,
      });
      return {
        annualLeavePolicies: STANDARD_LEAVE_POLICY_KEYS.map((key) => {
          const { id, name } = policies.find((policy) => policy.key === key)!;
          return { id, name };
        }),
        bankHolidayCalendars: BANK_HOLIDAY_CALENDARS.map((calendar) => ({
          calendar,
          countThisYear: holidays.get(calendar)?.length ?? 0,
        })),
      };
    },

    async suggestLocationCalendars(ctx, { locationNames }) {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const asked = locationNames.slice(0, MAX_LOCATIONS_ASKED);
      const answers = asked.length === 0 ? [] : await askJev(decisions, logger, asked);
      const suggestions = locationNames.map((locationName, index) => {
        const calendar = BANK_HOLIDAY_CALENDARS.find((known) => known === answers[index]);
        return calendar
          ? { locationName, bankHolidayCalendar: calendar, unsure: false }
          : { locationName, bankHolidayCalendar: "england_and_wales" as const, unsure: true };
      });
      logger.info(
        {
          locationCount: locationNames.length,
          unsureCount: suggestions.filter(({ unsure }) => unsure).length,
        },
        "Suggested location bank holidays",
      );
      return suggestions;
    },
  };
}

/** One request covers a large company's offices; any beyond are left to the owner. */
const MAX_LOCATIONS_ASKED = 100;

const STANDARD_LEAVE_POLICY_KEYS: readonly StandardLeavePolicyKey[] = [
  "uk_statutory_minimum",
  "uk_20_days_plus_bank_holidays",
  "uk_25_days_plus_bank_holidays",
];

const NATION_OPTIONS = {
  england_and_wales: "A place in England or Wales.",
  scotland: "A place in Scotland.",
  northern_ireland: "A place in Northern Ireland.",
  not_a_uk_place_or_unclear:
    "Not a place in the UK, or no place at all, such as Remote, HQ or Head office, or unclear.",
};

/** Jev's choice per location, null where it gave none; all null when it could not answer. */
async function askJev(
  decisions: Decisions,
  logger: Logger,
  locationNames: readonly string[],
): Promise<(string | null)[]> {
  const questions = Object.fromEntries(
    locationNames.map((_name, index) => [
      `location_${index + 1}`,
      {
        instructions:
          `Location ${index + 1} of \`locations\` is where some of a UK company's people work. ` +
          "Which nation's bank holidays apply to them?",
        options: NATION_OPTIONS,
      },
    ]),
  );
  try {
    // Place names identify no one, so they leave as they are; nothing else is sent.
    const answers = await decisions.decide({ locations: [...locationNames] }, questions, {
      unmaskedKeys: ["locations"],
    });
    return locationNames.map((_name, index) => answers[`location_${index + 1}`]?.choice ?? null);
  } catch (error) {
    if (!(error instanceof DecisionsError)) {
      throw error;
    }
    logger.warn(
      { locationCount: locationNames.length, retryable: error.retryable, reason: error.reason },
      "Location bank holidays not suggested",
    );
    return locationNames.map(() => null);
  }
}
