import { CaretDown } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FieldEditorProps } from "@/features/records";

/** The profiles an admin may give; the owner's comes from owning the instance. */
const ASSIGNABLE = ["EMPLOYEE", "ADMIN"] as const;

/** An editor for a person's permissions: a menu of the profiles an admin may give. */
export function PermissionProfilePicker({
  field,
  value,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: FieldEditorProps) {
  return (
    <DropdownMenu
      defaultOpen={!invalid}
      onOpenChange={(open, { reason }) => {
        if (open) return;
        if (reason === "escape-key") onRevert();
        else onDone();
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`${field.label}: ${field.format(value)}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{field.format(value)}</span>
            <CaretDown aria-hidden className="text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(next: string) => onChange(next)}>
          {ASSIGNABLE.map((profile) => (
            <DropdownMenuRadioItem key={profile} value={profile} closeOnClick>
              {field.format(profile)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
