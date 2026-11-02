# Bank holidays

Each nation's bank holidays: England and Wales, Scotland and Northern Ireland. A working pattern week names whose apply (see the [employees module](../employees/module.md#bank-holidays)); time off reads the dates to cost leave.

- A **bank holiday calendar** is `england_and_wales`, `scotland` or `northern_ireland`, stored as text so another region needs no type migration.
- The dates come from a `BankHolidaySource` (`integrations/bankHolidays`). Today's source answers from GOV.UK's dates copied into the code (`https://www.gov.uk/bank-holidays.json`), so every workspace has them offline; a new or cancelled bank holiday is a code change. Another source, such as one fetching the feed, replaces it without changing the reads.
- Other modules read the dates through `BankHolidayService.readBankHolidays`: each calendar's days over a period.
