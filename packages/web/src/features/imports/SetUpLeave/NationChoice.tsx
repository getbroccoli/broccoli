import type { ReactNode } from "react";

import type { BankHolidayCalendar } from "@/__generated__/graphql";
import { t } from "@/i18n";

type Props = {
  nation: BankHolidayCalendar;
  /** The step's question, so a screen reader names whose choice each option is. */
  question: string;
  people?: number;
  /** Shows the nation's name, for a page with several nations. */
  showName: boolean;
  children: ReactNode;
};

/** One nation's answer to a question of the Set up leave page. */
export function NationChoice({ nation, question, people, showName, children }: Props) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={showName ? "mb-2 text-sm font-medium" : "sr-only"}>
        <span className="sr-only">{question} </span>
        {t("setup.leave.termsTitle", { name: t(`setup.leave.nation.${nation}`) })}
        {people !== undefined && (
          <span className="font-normal text-muted-foreground">
            {" · "}
            {people === 1
              ? t("setup.leave.peopleOne")
              : t("setup.leave.people", { count: String(people) })}
          </span>
        )}
      </legend>
      {children}
    </fieldset>
  );
}
