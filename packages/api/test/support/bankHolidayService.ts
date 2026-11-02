import { createStaticBankHolidaySource } from "../../src/integrations/bankHolidays";
import { createBankHolidayService } from "../../src/modules/employees";

/** The bank holiday reads over the dates shipped with the code. */
export function bankHolidayService() {
  return createBankHolidayService({ bankHolidaySource: createStaticBankHolidaySource() });
}
