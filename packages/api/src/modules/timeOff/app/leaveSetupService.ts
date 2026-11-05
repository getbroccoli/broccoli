import type { Orm } from "../../../core/db";
import type { Logger } from "../../../core/logger";
import { PrincipalSecurityContext, type SecurityContext } from "../../../core/security";
import { type Decisions, DecisionsError } from "../../../integrations/ai";
import { type CalendarDate, todayInLondon } from "../../../utils";
import {
  BANK_HOLIDAY_CALENDARS,
  type BankHolidayCalendar,
  type BankHolidayService,
} from "../../bankHolidays";
import { timeOffPolicyRepository } from "../db";
import type { AllowanceRule, StandardLeavePolicyKey } from "../domain";

/** The choices of the Set up leave page, and the model's suggestion for each location. Admins only. */
export interface LeaveSetupService {
  readLeaveSetup: (ctx: SecurityContext) => Promise<LeaveSetup>;
  /**
   * Asks the model, with the location names only, whose bank holidays apply at each location, in the
   * order given. Never fails: without an answer a location is England and Wales, unsure.
   */
  suggestLocationCalendars: (
    ctx: SecurityContext,
    input: { locationNames: readonly string[] },
  ) => Promise<LocationCalendarSuggestion[]>;
}

/** What the Set up leave page offers. */
export interface LeaveSetup {
  /** The standard Annual leave policies, the UK statutory minimum first. */
  annualLeavePolicies: {
    id: string;
    name: string;
    daysForFiveDayWeek: number;
    bankHolidaysOnTop: boolean;
  }[];
  /** Each nation's bank holidays this year (London). */
  bankHolidayCalendars: { calendar: BankHolidayCalendar; countThisYear: number }[];
}

/** The model's guess of whose bank holidays apply at a location; unsure ones fall back to England and Wales. */
export interface LocationCalendarSuggestion {
  locationName: string;
  bankHolidayCalendar: BankHolidayCalendar;
  unsure: boolean;
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
      // The setup holder is no signed-in user; bank holidays are public facts, so Broccoli reads them.
      const holidays = await bankHolidays.readBankHolidays(PrincipalSecurityContext.system(), {
        calendars: BANK_HOLIDAY_CALENDARS,
        from: `${year}-01-01`,
        until: `${year}-12-31`,
      });
      return {
        annualLeavePolicies: STANDARD_LEAVE_POLICY_KEYS.map((key) => {
          const { id, name, rules, bankHolidays } = policies.find((policy) => policy.key === key)!;
          return {
            id,
            name,
            daysForFiveDayWeek: daysForFiveDayWeek(rules),
            bankHolidaysOnTop: bankHolidays === "bank_holidays_on_top_of_allowance",
          };
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
      const answers = asked.length === 0 ? [] : await askModel(decisions, logger, asked);
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

/** A yearly entitlement pro-rated to five days a week and capped, as the allowance engine does. */
function daysForFiveDayWeek(rules: readonly AllowanceRule[]): number {
  // Every Annual leave policy has one.
  const yearly = rules.find((rule) => rule.kind === "yearly_entitlement")!;
  const days = (yearly.entitlementDays * 5) / yearly.entitlementDaysPerWeek;
  return yearly.maxDays === null ? days : Math.min(days, yearly.maxDays);
}

/** One request covers a large company's offices; any beyond are left to the owner. */
const MAX_LOCATIONS_ASKED = 100;

const STANDARD_LEAVE_POLICY_KEYS: readonly StandardLeavePolicyKey[] = [
  "uk_statutory_minimum",
  "uk_20_days_plus_bank_holidays",
  "uk_25_days_plus_bank_holidays",
];

const NATION_OPTIONS = {
  england_and_wales: "A place in England or Wales, such as Manchester office or Swansea site.",
  scotland: "A place in Scotland, such as Dundee office or Inverness site.",
  northern_ireland: "A place in Northern Ireland, such as Newry office or Lisburn site.",
  not_a_uk_place_or_unclear:
    "No UK place can be told from it: a place abroad, or no place at all, such as Remote or Head office.",
};

/** The model's choice per location, null where it gave none; all null when it could not answer. */
async function askModel(
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
          "Its name may add a word such as office, site or HQ to a town or city; the town or city " +
          "decides. Which nation's bank holidays apply to them?",
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
