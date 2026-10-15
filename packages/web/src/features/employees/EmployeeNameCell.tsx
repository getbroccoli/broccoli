import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { useState } from "react";

import {
  EmployeeNameCell_EmployeeFragmentDoc,
  type EmployeeNameCell_EmployeeFragment,
} from "@/__generated__/graphql";
import { initialsOf } from "@/lib/initials";

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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  // The query that rendered this row has just written the fragment, so it is complete.
  if (!complete) return null;
  const { firstName, lastName, avatarUrl } = data;

  return (
    <div className="flex items-center gap-2.5">
      {avatarUrl && avatarUrl !== failedAvatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedAvatarUrl(avatarUrl)}
          className="size-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
        >
          {initialsOf(firstName, lastName)}
        </span>
      )}
      <span className="truncate font-medium text-foreground">{`${firstName} ${lastName}`}</span>
    </div>
  );
}
