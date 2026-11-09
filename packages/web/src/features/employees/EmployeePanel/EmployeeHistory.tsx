import { useNavigate, useSearch } from "@tanstack/react-router";

import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";
import { EMPLOYMENT_TERMS_FIELDS, historyAreaOf } from "./employeeHistoryArea";
import type { EmployeePanelSearch } from "./employeePanelSearch";

type Props = {
  employeeId: string;
};

/** A person's History tab: every change, or only those to their employment terms or their details. */
export function EmployeeHistory({ employeeId }: Props) {
  const { changes } = useSearch({ from: "/_authenticated/people/$employeeId" });
  const navigate = useNavigate({ from: "/people/$employeeId" });

  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label={t("people.panel.history.show")}
        className="flex flex-wrap gap-2"
      >
        {CHANGES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={changes === value}
            onClick={() =>
              void navigate({ search: (previous) => ({ ...previous, changes: value }) })
            }
            className={cn(
              "h-8 rounded-full border px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              changes === value
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`people.panel.history.${value}`)}
          </button>
        ))}
      </div>
      <RecordHistory
        // A new filter is a new history, with its own paging.
        key={changes}
        recordType="EMPLOYEE"
        recordId={employeeId}
        description={EMPLOYEE_DESCRIPTION}
        titled={false}
        filter={FILTERS[changes]}
        tagOf={(line) =>
          t(
            historyAreaOf(line.changes.map(({ field }) => field)) === "EMPLOYMENT_TERMS"
              ? "people.panel.history.employmentTerms"
              : "people.panel.history.details",
          )
        }
      />
    </div>
  );
}

const CHANGES = [
  "all",
  "employmentTerms",
  "details",
] as const satisfies readonly EmployeePanelSearch["changes"][];

const FILTERS: Record<
  EmployeePanelSearch["changes"],
  Parameters<typeof RecordHistory>[0]["filter"]
> = {
  all: undefined,
  employmentTerms: { changingAnyOf: EMPLOYMENT_TERMS_FIELDS },
  details: { changingNoneOf: EMPLOYMENT_TERMS_FIELDS },
};
