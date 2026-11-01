import { useState } from "react";

import type { ManagerCell_ManagerFragment } from "@/__generated__/graphql";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";

import { employeeNameOf, fieldLabel, valuesLabel } from "./employeeFields";
import { FlagPill } from "./FlagPill";
import { ManagerPopover } from "./ManagerPopover";
import { NotSet } from "./NotSet";

type Props = {
  employeeId: string;
  employeeName: string;
  manager: ManagerCell_ManagerFragment;
};

/**
 * An import employee's manager: the person Approve sets, an amber pill when the files disagree or
 * name no one Approve adds, or no manager. A click opens the popover to pick a source's or choose a
 * person. Owns the `ManagerCell_manager` fragment, which the columns spread with `@unmask`.
 */
export function ManagerCell({ employeeId, employeeName, manager }: Props) {
  const [open, setOpen] = useState(false);
  const shown = shownManager(manager);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={t("setup.review.valueLabel", {
              field: fieldLabel("manager"),
              name: employeeName,
              value: shown ?? t("setup.review.notSet"),
            })}
            className="max-w-full truncate rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        {flagged(manager) ? <FlagPill>{shown}</FlagPill> : (shown ?? <NotSet />)}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-2rem)] gap-4 rounded-xl p-5"
      >
        <ManagerPopover
          employeeId={employeeId}
          employeeName={employeeName}
          manager={manager}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** What the owner settles: sources that disagree, or a manager that gives no one at Approve. */
function flagged({ reference, chosen, problem }: ManagerCell_ManagerFragment): boolean {
  return problem !== null || (!chosen && reference.conflict);
}

/** The manager's name, "N managers" while the files disagree, the reference that gives no one, or null. */
function shownManager({ reference, employee, chosen, problem }: ManagerCell_ManagerFragment) {
  if (employee) {
    return employeeNameOf(employee.firstName.value, employee.lastName.value);
  }
  if (!chosen && reference.conflict) {
    return valuesLabel("manager", reference.options.length);
  }
  if (problem === "MANAGERS_FORM_A_LOOP") {
    return t("setup.review.manager.inLoop");
  }
  if (problem) {
    return chosen ? t("setup.review.manager.chosenNotAdded") : reference.value;
  }
  return chosen ? t("setup.review.manager.noManager") : null;
}
