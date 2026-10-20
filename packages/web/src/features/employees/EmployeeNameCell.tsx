import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  EmployeeNameCell_EmployeeFragmentDoc,
  type EmployeeNameCell_EmployeeFragment,
} from "@/__generated__/graphql";

import { Avatar } from "./Avatar";

/**
 * The name with the avatar, or initials without one or when it fails to load; owns the
 * `EmployeeNameCell_employee` fragment.
 */
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
  const { firstName, lastName, avatarUrl } = data;

  return (
    <div className="flex items-center gap-2.5">
      <Avatar url={avatarUrl ?? null} firstName={firstName} lastName={lastName} />
      <span className="truncate font-medium text-foreground">{`${firstName} ${lastName}`}</span>
    </div>
  );
}
