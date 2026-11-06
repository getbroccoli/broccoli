/**
 * How time off is turned on: per nation's terms, its working week and standard Annual leave policy, and which
 * nation's terms each location's people get. Values are as sent; turning time off on checks them.
 */
export interface SetupTermsInput {
  terms: { bankHolidayCalendar: string; workingWeek: string; annualLeavePolicyKey: string }[];
  locationTerms: { locationName: string; bankHolidayCalendar: string }[];
  /** The nation of the default terms, which people without a location start on; England and Wales when left out. */
  defaultBankHolidayCalendar?: string;
}
