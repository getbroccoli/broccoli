import {
  createBankHolidayService,
  createStaticBankHolidaySource,
} from "../../src/modules/bankHolidays";

/** The bank holiday reads over the dates shipped with the code. */
export function bankHolidayService() {
  return createBankHolidayService({ bankHolidaySource: createStaticBankHolidaySource() });
}
