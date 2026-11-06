import { Briefcase, X } from "@phosphor-icons/react";

import type { EmploymentTermsStackQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { DefaultPill } from "./DefaultPill";
import { TermsMenu } from "./TermsMenu";
import { TermsTimeOffSection } from "./TermsTimeOffSection";
import { TERMS_DESCRIPTION } from "./termsDescription";
import { WorkingWeekSection } from "./WorkingWeekSection";

type Props = {
  terms: NonNullable<EmploymentTermsStackQuery["terms"]>;
};

/** One loaded set of terms: header, working week, time off and locations, with history beside them. */
export function TermsRecord({ terms }: Props) {
  const meta = [
    t(terms.peopleCount === 1 ? "terms.peopleOne" : "terms.people", {
      count: String(terms.peopleCount),
    }),
    ...(terms.locations.length > 0 ? [terms.locations.map(({ name }) => name).join(", ")] : []),
  ].join(" · ");

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
        >
          <Briefcase size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <SheetTitle className="truncate">{terms.name}</SheetTitle>
            {terms.isDefault && <DefaultPill />}
          </div>
          <p className="truncate text-[13px] text-muted-foreground">{meta}</p>
        </div>
        <TermsMenu terms={terms} />
        <SheetClose render={<Button variant="ghost" size="icon" aria-label={t("terms.close")} />}>
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        <div className="flex flex-col gap-8 px-6 py-6 md:flex-[2] md:overflow-y-auto">
          <WorkingWeekSection versions={terms.workingWeek} />
          <TermsTimeOffSection termsName={terms.name} timeOff={terms.timeOff} />
          <section aria-labelledby="terms-locations" className="flex flex-col gap-3">
            <h3 id="terms-locations" className="text-[17px] font-semibold">
              {t("terms.locations.title")}
            </h3>
            <p className="text-[13px] text-muted-foreground">
              {t("terms.locations.description")}
              {terms.isDefault && ` ${t("terms.locations.defaultDescription")}`}
            </p>
            {terms.locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("terms.locations.none")}</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {terms.locations.map(({ id, name }) => (
                  <li key={id} className="rounded-full border border-border px-3 py-1.5 text-sm">
                    {name}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="border-t border-border bg-muted/40 px-6 py-6 md:flex-1 md:overflow-y-auto md:border-t-0 md:border-l">
          <RecordHistory recordType="TERMS" recordId={terms.id} description={TERMS_DESCRIPTION} />
        </aside>
      </div>

      <footer className="flex justify-end border-t border-border px-6 py-3">
        <SheetClose render={<Button variant="outline" />}>{t("terms.close")}</SheetClose>
      </footer>
    </>
  );
}
