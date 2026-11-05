import { invalidInput } from "../../../core/applicationError";
import type { SetupTermsInput } from "../../../core/instance";
import { type BankHolidayCalendar, parseBankHolidayCalendar } from "../../bankHolidays";
import { parseLocationName } from "./location";
import { parseStandardWorkingWeek, type StandardWorkingWeek } from "./standardWorkingWeek";

/** One entry per nation's terms, the default nation's among them, and which nation's terms each location's people get. */
export interface TermsSetup {
  terms: readonly { bankHolidayCalendar: BankHolidayCalendar; workingWeek: StandardWorkingWeek }[];
  locationTerms: readonly { locationName: string; bankHolidayCalendar: BankHolidayCalendar }[];
  /** The nation of the default terms, which people without a location start on. */
  defaultBankHolidayCalendar: BankHolidayCalendar;
}

/**
 * The owner's terms as sent, refused unless each nation and week is known, the default nation
 * (England and Wales unless sent) is among them, each once, and every location gets one of them.
 */
export function parseTermsSetup(input: SetupTermsInput): TermsSetup {
  const terms = input.terms.map(({ bankHolidayCalendar, workingWeek }) => ({
    bankHolidayCalendar: parseBankHolidayCalendar(bankHolidayCalendar),
    workingWeek: parseStandardWorkingWeek(workingWeek),
  }));
  const calendars = terms.map(({ bankHolidayCalendar }) => bankHolidayCalendar);
  const defaultBankHolidayCalendar = parseBankHolidayCalendar(
    input.defaultBankHolidayCalendar ?? "england_and_wales",
    "defaultBankHolidayCalendar",
  );
  if (!calendars.includes(defaultBankHolidayCalendar)) {
    throw invalidInput([{ field: "terms", code: "required" }]);
  }
  if (new Set(calendars).size !== calendars.length) {
    throw invalidInput([{ field: "terms", code: "duplicate" }]);
  }
  const locationTerms = input.locationTerms.map(({ locationName, bankHolidayCalendar }) => ({
    locationName: parseLocationName(locationName),
    bankHolidayCalendar: parseBankHolidayCalendar(bankHolidayCalendar),
  }));
  if (locationTerms.some(({ bankHolidayCalendar }) => !calendars.includes(bankHolidayCalendar))) {
    throw invalidInput([{ field: "locationTerms", code: "invalid" }]);
  }
  return { terms, locationTerms, defaultBankHolidayCalendar };
}
