/**
 * How leave is turned on: per nation's terms, its working week and Annual leave policy, and which
 * nation's terms each location's people get. Values are as sent; turning leave on checks them.
 */
export interface TurnOnLeaveInput {
  terms: { bankHolidayCalendar: string; workingWeek: string; annualLeavePolicyId: string }[];
  locationTerms: { locationName: string; bankHolidayCalendar: string }[];
}
