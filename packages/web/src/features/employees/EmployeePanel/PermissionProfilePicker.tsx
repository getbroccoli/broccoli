import { CaretDown } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FieldEditorProps } from "@/features/records";
import { t } from "@/i18n";

type Props = FieldEditorProps;

/** Everyone has it; it shows checked and cannot be removed. */
const DEFAULT_PROFILE = "EMPLOYEE";

/** The profiles an admin may give beside the default one; the owner's comes from owning the instance. */
const ASSIGNABLE = ["ADMIN"] as const;

/**
 * An editor for a person's permissions: a menu with the default profile always on and a checkbox
 * per profile an admin may give. The value is the whole set, comma-separated.
 */
export function PermissionProfilePicker({
  field,
  value,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: Props) {
  const held = new Set(value.split(","));
  const toggle = (profile: string, checked: boolean) => {
    const next = [DEFAULT_PROFILE, ...ASSIGNABLE].filter((name) =>
      name === profile ? checked : held.has(name) || name === DEFAULT_PROFILE,
    );
    onChange(next.join(","));
  };

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
        <DropdownMenuCheckboxItem checked disabled title={t("people.panel.permissionProfile.base")}>
          {field.format(DEFAULT_PROFILE)}
        </DropdownMenuCheckboxItem>
        {ASSIGNABLE.map((profile) => (
          <DropdownMenuCheckboxItem
            key={profile}
            checked={held.has(profile)}
            onCheckedChange={(checked: boolean) => toggle(profile, checked)}
          >
            {field.format(profile)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
