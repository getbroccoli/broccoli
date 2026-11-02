import { useQuery } from "@apollo/client/react";
import { CaretDown } from "@phosphor-icons/react";

import { LocationPickerDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { FieldEditorProps } from "@/features/records";
import { t } from "@/i18n";

type Props = FieldEditorProps;

/** An editor for a person's location: a menu of the locations Settings lists, or none. The value is the location's id. */
export function LocationPicker({
  field,
  value,
  invalid,
  describedBy,
  onChange,
  onDone,
  onRevert,
}: Props) {
  const { data } = useQuery(LocationPickerDocument);
  const shown = value ? field.format(value) : t("people.panel.location.none");

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
            aria-label={`${field.label}: ${shown}`}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{shown}</span>
            <CaretDown aria-hidden className="text-muted-foreground" />
          </Button>
        }
      />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(id: string) => onChange(id)}>
          {data?.locations.map((location) => (
            <DropdownMenuRadioItem key={location.id} value={location.id} closeOnClick>
              {location.name}
            </DropdownMenuRadioItem>
          ))}
          {data?.locations.length ? <DropdownMenuSeparator /> : null}
          <DropdownMenuRadioItem value="" closeOnClick>
            {t("people.panel.location.none")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
