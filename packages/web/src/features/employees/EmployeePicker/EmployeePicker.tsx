import { CaretDown } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FieldEditorProps } from "@/features/records";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { EmployeeSearch } from "./EmployeeSearch";

type Props = FieldEditorProps;

/**
 * An editor for a field that holds a person, such as the manager: a popover that searches people
 * by name or email and picks one, or none; the record's own person is left out. The value is the
 * picked person's id; "" is none.
 */
export function EmployeePicker({
  field,
  recordId,
  value,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: Props) {
  const shown = value ? field.format(value) : t("people.panel.employeePicker.none");
  return (
    <Popover
      // Opened by a click on the field; a field shown for its refusal stays shut so the reason shows.
      defaultOpen={!invalid}
      onOpenChange={(open, { reason }) => {
        if (open) return;
        if (reason === "escape-key") onRevert();
        else onDone();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`${field.label}: ${shown}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn("w-full justify-between font-normal", !value && "text-muted-foreground")}
          >
            <span className="truncate">{shown}</span>
            <CaretDown aria-hidden className="text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 p-0">
        <EmployeeSearch
          label={field.label}
          excludedId={recordId}
          selectedId={value}
          onPick={(person) => {
            onChange(person?.id ?? "");
            onDone();
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
