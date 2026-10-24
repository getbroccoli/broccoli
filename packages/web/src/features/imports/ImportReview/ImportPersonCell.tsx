import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  ImportPersonCell_ImportEmployeeFragmentDoc,
  type ImportEmployeeIncompleteReason,
  type ImportPersonCell_ImportEmployeeFragment,
} from "@/__generated__/graphql";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";

import { employeeNameOf } from "./employeeFields";
import { EmployeeValueCell } from "./EmployeeValueCell";
import { FlagPill } from "./FlagPill";

const REASONS = {
  FIRST_NAME: "setup.review.reason.firstName",
  LAST_NAME: "setup.review.reason.lastName",
  EMAIL: "setup.review.reason.email",
  OTHER: "setup.review.reason.other",
} as const satisfies Record<ImportEmployeeIncompleteReason, string>;

/**
 * The photo or initials and the first and last name, each a value to pick or type; below, "Left out"
 * or why Approve leaves the import employee out. Owns the `ImportPersonCell_importEmployee` fragment.
 */
export function ImportPersonCell({
  employee: from,
}: {
  employee: FragmentType<ImportPersonCell_ImportEmployeeFragment>;
}) {
  const { data: employee, complete } = useFragment({
    fragment: ImportPersonCell_ImportEmployeeFragmentDoc,
    // The document also holds the value cell's fragment it spreads.
    fragmentName: "ImportPersonCell_importEmployee",
    from,
  });
  // The query that rendered this row has just written the fragment, so it is complete.
  if (!complete) return null;
  const { firstName, lastName } = employee;
  const name = employeeNameOf(firstName.value, lastName.value);
  return (
    <div className="flex items-center gap-3">
      <Avatar
        url={employee.avatarUrl ?? null}
        firstName={firstName.value ?? ""}
        lastName={lastName.value ?? ""}
      />
      <div className="flex min-w-0 flex-col items-start">
        <p className="flex max-w-full items-center gap-1 truncate font-medium text-foreground">
          <EmployeeValueCell
            employeeId={employee.id}
            employeeName={name}
            field="firstName"
            value={firstName}
            missing={employee.incompleteReason === "FIRST_NAME"}
          />
          <EmployeeValueCell
            employeeId={employee.id}
            employeeName={name}
            field="lastName"
            value={lastName}
            missing={employee.incompleteReason === "LAST_NAME"}
          />
        </p>
        {employee.leftOut ? (
          <span className="mt-0.5 text-xs text-muted-foreground">
            {t("setup.review.leftOutPerson")}
          </span>
        ) : (
          employee.incompleteReason && (
            <FlagPill className="mt-0.5 h-auto min-h-6 max-w-full py-0.5 whitespace-normal">
              <span className="sr-only">{t("setup.review.wontBeAdded")}</span>
              {t(REASONS[employee.incompleteReason])}
            </FlagPill>
          )
        )}
      </div>
    </div>
  );
}
