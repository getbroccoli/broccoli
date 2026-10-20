import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { useState } from "react";

import {
  ChooseSourceForAllDocument,
  ImportReviewDocument,
  LeaveOutIncompleteDocument,
  ThingsToCheck_CheckFragmentDoc,
  type ThingsToCheck_CheckFragment,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { t } from "@/i18n";

import { fieldKeyOf, pluralLabel } from "./employeeFields";
import { FlagPill } from "./FlagPill";

const INCOMPLETE = {
  FIRST_NAME: "setup.review.checks.incomplete.firstName",
  LAST_NAME: "setup.review.checks.incomplete.lastName",
  EMAIL: "setup.review.checks.incomplete.email",
  OTHER: "setup.review.checks.incomplete.other",
} as const;

/**
 * "N things to check": each kind settled in one go, or shown in the table one by one,
 * as in the setup design. Hidden when nothing is left. Owns the `ThingsToCheck_check` fragment.
 */
export function ThingsToCheck({
  checks: from,
  onShow,
}: {
  checks: FragmentType<ThingsToCheck_CheckFragment>[];
  /** Narrows the table to this check's import employees. */
  onShow: (checkId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [chooseSourceForAll, chosen] = usePayloadMutation(ChooseSourceForAllDocument, {
    refetch: [ImportReviewDocument],
  });
  const [leaveOutIncomplete, leftOut] = usePayloadMutation(LeaveOutIncompleteDocument, {
    refetch: [ImportReviewDocument],
  });
  const { data: checks, complete } = useFragment({
    fragment: ThingsToCheck_CheckFragmentDoc,
    from,
  });
  if (!complete || checks.length === 0) return null;
  const total = checks.reduce((sum, { count }) => sum + count, 0);
  const label =
    total === 1
      ? t("setup.review.checks.buttonOne")
      : t("setup.review.checks.button", { count: String(total) });
  const busy = chosen.loading || leftOut.loading;
  const failed = chosen.error || leftOut.error;

  // A failure shows in the line below the kinds.
  const settle = (work: Promise<unknown>) => void work.catch(() => undefined);
  const show = (checkId: string) => {
    setOpen(false);
    onShow(checkId);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<button type="button" className="rounded-full" />}>
        <FlagPill className="h-8 px-3 text-sm">{label}</FlagPill>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[440px] max-w-[calc(100vw-2rem)] gap-4 rounded-xl p-5"
      >
        <PopoverHeader>
          <PopoverTitle className="text-base">{label}</PopoverTitle>
          <PopoverDescription className="text-sm leading-[1.5]">
            {t("setup.review.checks.description")}
          </PopoverDescription>
        </PopoverHeader>
        <ul className="flex flex-col gap-4">
          {checks.map((check) => (
            <li key={check.id} className="flex flex-col gap-2">
              <p className="text-sm font-medium">{sentence(check)}</p>
              <div className="flex flex-wrap gap-2">
                {check.kind === "CONFLICT" ? (
                  check.sources.map((source, index) => (
                    <Button
                      key={source.id}
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                      disabled={busy}
                      onClick={() =>
                        settle(
                          chooseSourceForAll({
                            variables: { field: check.field!, sourceId: source.id },
                          }),
                        )
                      }
                    >
                      {t("setup.review.checks.useForAll", { source: source.name })}
                    </Button>
                  ))
                ) : (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      settle(leaveOutIncomplete({ variables: { reason: check.reason! } }))
                    }
                  >
                    {t("setup.review.checks.leaveThemOut")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => show(check.id)}>
                  {check.kind === "CONFLICT"
                    ? t("setup.review.checks.oneByOne")
                    : t("setup.review.checks.showThem")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {t("setup.review.checks.failed")}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** "7 people with different job titles in their sources", "1 person without a work email". */
function sentence({ kind, count, field, reason }: ThingsToCheck_CheckFragment): string {
  const people =
    count === 1 ? t("setup.review.countOne") : t("setup.review.count", { count: String(count) });
  if (kind === "CONFLICT") {
    return t("setup.review.checks.conflict", { people, values: pluralLabel(fieldKeyOf(field!)) });
  }
  return t(INCOMPLETE[reason!], { people });
}
