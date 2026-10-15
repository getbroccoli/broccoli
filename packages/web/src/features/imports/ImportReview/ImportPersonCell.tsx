import type { ImportEmployeeIncompleteReason } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { initialsOf } from "@/lib/initials";

import { NotSet } from "./NotSet";

const REASONS = {
  FIRST_NAME: "setup.review.reason.firstName",
  LAST_NAME: "setup.review.reason.lastName",
  EMAIL: "setup.review.reason.email",
  OTHER: "setup.review.reason.other",
} as const satisfies Record<ImportEmployeeIncompleteReason, string>;

interface ImportPerson {
  firstName?: string | null;
  lastName?: string | null;
  incompleteReason?: ImportEmployeeIncompleteReason | null;
}

/** Initials and name; a person Approve leaves out says so in amber, with the reason. */
export function ImportPersonCell({ person }: { person: ImportPerson }) {
  const name = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="avatar-tint flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium text-white"
      >
        {initialsOf(person.firstName ?? "", person.lastName ?? "") || "?"}
      </span>
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{name || <NotSet missing />}</p>
        {person.incompleteReason && (
          <p className="flex items-start gap-1.5 text-[13px] leading-snug whitespace-normal text-amber-800">
            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
            {t("setup.review.wontBeAdded", { reason: t(REASONS[person.incompleteReason]) })}
          </p>
        )}
      </div>
    </div>
  );
}
