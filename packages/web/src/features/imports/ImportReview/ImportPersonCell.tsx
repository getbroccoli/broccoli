import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  ImportPersonCell_ImportEmployeeFragmentDoc,
  type ImportEmployeeIncompleteReason,
  type ImportPersonCell_ImportEmployeeFragment,
} from "@/__generated__/graphql";
import { t } from "@/i18n";
import { initialsOf } from "@/lib/initials";

import { NotSet } from "./NotSet";

const REASONS = {
  FIRST_NAME: "setup.review.reason.firstName",
  LAST_NAME: "setup.review.reason.lastName",
  EMAIL: "setup.review.reason.email",
  OTHER: "setup.review.reason.other",
} as const satisfies Record<ImportEmployeeIncompleteReason, string>;

/**
 * Initials and name; a person Approve leaves out gets an amber pill with the reason.
 * Owns the `ImportPersonCell_importEmployee` fragment.
 */
export function ImportPersonCell({
  person: from,
}: {
  person: FragmentType<ImportPersonCell_ImportEmployeeFragment>;
}) {
  const { data: person, complete } = useFragment({
    fragment: ImportPersonCell_ImportEmployeeFragmentDoc,
    from,
  });
  // The query that rendered this row has just written the fragment, so it is complete.
  if (!complete) return null;
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
      >
        {initialsOf(person.firstName ?? "", person.lastName ?? "") || "?"}
      </span>
      <div className="flex min-w-0 flex-col items-start">
        <p className="max-w-full truncate font-medium text-foreground">
          {name || <NotSet missing />}
        </p>
        {person.incompleteReason && (
          <span className="mt-0.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-900">
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-amber-500" />
            <span className="sr-only">{t("setup.review.wontBeAdded")}</span>
            {t(REASONS[person.incompleteReason])}
          </span>
        )}
      </div>
    </div>
  );
}
