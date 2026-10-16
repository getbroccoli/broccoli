import { useState } from "react";

import type { EmployeeValueCell_ValueFragment } from "@/__generated__/graphql";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatCalendarDate } from "@/lib/formatDate";

import { type EmployeeFieldKey, valuesLabel } from "./employeeFields";
import { EmployeeValuePopover } from "./EmployeeValuePopover";
import { FlagPill } from "./FlagPill";
import { NotSet } from "./NotSet";

/**
 * One value of an import employee, or an amber pill while its sources disagree; a click
 * opens the popover to pick or type it. Owns the `EmployeeValueCell_value` fragment, which
 * parents spread with `@unmask`: a value has no id of its own to read it from the cache by.
 */
export function EmployeeValueCell({
  employeeId,
  employeeName,
  field,
  value,
  missing = false,
}: {
  employeeId: string;
  employeeName: string;
  field: EmployeeFieldKey;
  value: EmployeeValueCell_ValueFragment;
  /** Whether an empty value is why Approve leaves the import employee out. */
  missing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="max-w-full truncate rounded-sm text-left hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        {value.conflict ? (
          <FlagPill>{valuesLabel(field, value.options.length)}</FlagPill>
        ) : (
          shown(field, value.value, missing)
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[380px] max-w-[calc(100vw-2rem)] gap-4 rounded-xl p-5"
      >
        <EmployeeValuePopover
          employeeId={employeeId}
          employeeName={employeeName}
          field={field}
          value={value}
          onDone={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function shown(field: EmployeeFieldKey, value: string | null, missing: boolean) {
  if (value === null) {
    return <NotSet missing={missing} />;
  }
  return field === "startDate" ? (
    <span className="text-foreground/80 tabular-nums">{formatCalendarDate(value)}</span>
  ) : (
    value
  );
}
