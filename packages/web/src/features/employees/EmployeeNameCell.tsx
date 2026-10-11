import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  EmployeeNameCell_EmployeeFragmentDoc,
  type EmployeeNameCell_EmployeeFragment,
} from "@/__generated__/graphql";

/** The name with an initials avatar; owns the `EmployeeNameCell_employee` fragment. */
export function EmployeeNameCell({
  employee,
}: {
  employee: FragmentType<EmployeeNameCell_EmployeeFragment>;
}) {
  const { data, complete } = useFragment({
    fragment: EmployeeNameCell_EmployeeFragmentDoc,
    from: employee,
  });
  // The query that rendered this row has just written the fragment, so it is complete.
  if (!complete) return null;
  const { firstName, lastName } = data;

  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
      >
        {initialsOf(firstName, lastName)}
      </span>
      <span className="truncate font-medium text-foreground">{`${firstName} ${lastName}`}</span>
    </div>
  );
}

function initialsOf(firstName: string, lastName: string): string {
  // By code point, so a name starting with an emoji or astral letter keeps it whole.
  const [first = ""] = firstName;
  const [last = ""] = lastName;
  return `${first}${last}`.toUpperCase();
}
