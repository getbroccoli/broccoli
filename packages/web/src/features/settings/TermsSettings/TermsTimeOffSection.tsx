import { CalendarBlank } from "@phosphor-icons/react";

import type { EmploymentTermsStackQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { TimeOffTypeIcon } from "../TimeOffSettings";
import { plannedLine, ruleLine, splitVersions } from "./termsText";

type Props = {
  termsName: string;
  timeOff: NonNullable<EmploymentTermsStackQuery["terms"]>["timeOff"];
};

/** Each time off type's rules on the terms today, or "Not offered here", with planned rules under them. */
export function TermsTimeOffSection({ termsName, timeOff }: Props) {
  return (
    <section aria-labelledby="terms-time-off" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id="terms-time-off" className="text-[17px] font-semibold">
          {t("terms.timeOff.title")}
        </h3>
        <p className="text-[13px] text-muted-foreground">{t("terms.timeOff.description")}</p>
      </div>
      <ul className="flex flex-col gap-2.5">
        {timeOff.map(({ timeOffType, versions }) => {
          const { current, planned } = splitVersions(versions);
          return (
            <li
              key={timeOffType.id}
              className={
                current
                  ? "flex items-start gap-3 rounded-xl border border-border p-3.5"
                  : "flex items-start gap-3 rounded-xl border border-dashed border-border p-3.5"
              }
            >
              <TimeOffTypeIcon icon={timeOffType.icon} colour={timeOffType.colour} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold [overflow-wrap:anywhere]">{timeOffType.name}</p>
                <p className="text-[13px] text-muted-foreground">
                  {current
                    ? ruleLine(current)
                    : t("terms.timeOff.notOffered", { terms: termsName })}
                </p>
                {planned.map((version) => (
                  <p
                    key={version.id}
                    className="mt-1.5 flex items-center gap-2 text-[13px] text-muted-foreground"
                  >
                    <CalendarBlank aria-hidden />
                    {plannedLine(version)}
                  </p>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
