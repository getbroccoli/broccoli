import { useQuery } from "@apollo/client/react";
import { CaretDown, Check } from "@phosphor-icons/react";
import { useState } from "react";

import { EmployeeOptionsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { FieldEditorProps } from "@/features/records";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

import { Avatar } from "../Avatar";

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
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(value || NONE);
  const typed = search.trim().slice(0, SEARCH_MAX_LENGTH);
  const query = useDebouncedValue(typed, DEBOUNCE_MS);
  const { data, previousData, loading, error } = useQuery(EmployeeOptionsDocument, {
    variables: { search: query || null },
    // People change while the panel is open, so a repeated search asks again.
    fetchPolicy: "cache-and-network",
  });
  // Enter picks only from the results of what is typed, never a stale or pending list.
  const settled = query === typed && !loading && Boolean(data);
  const people =
    (data ?? previousData)?.employees.edges
      .map(({ node }) => node)
      .filter(({ id }) => id !== recordId) ?? [];
  const options = [...(typed ? [] : [NONE]), ...people.map(({ id }) => id)];
  // New results replace the list, so the highlight falls back to its first row.
  const active = options.includes(highlighted) ? highlighted : (options[0] ?? "");
  const shown = value ? field.format(value) : t("people.panel.employeePicker.none");

  const pick = (id: string) => {
    if (!settled) return;
    onChange(id);
    onDone();
  };

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
        <Command
          shouldFilter={false}
          label={field.label}
          value={active}
          onValueChange={setHighlighted}
        >
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={t("people.panel.employeePicker.search")}
            autoFocus
          />
          <CommandList>
            {!typed && (
              <CommandItem value={NONE} onSelect={() => pick("")}>
                <span className="text-muted-foreground">
                  {t("people.panel.employeePicker.none")}
                </span>
                {!value && <Check aria-hidden className="ml-auto size-3.5" />}
              </CommandItem>
            )}
            {people.map((person) => (
              <CommandItem key={person.id} value={person.id} onSelect={() => pick(person.id)}>
                <Avatar
                  url={person.avatarUrl}
                  firstName={person.firstName}
                  lastName={person.lastName}
                  className="size-5 text-[9px]"
                />
                <span className="truncate">
                  {person.firstName} {person.lastName}
                </span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">
                  {person.jobTitle}
                </span>
                {person.id === value && <Check aria-hidden className="size-3.5 shrink-0" />}
              </CommandItem>
            ))}
            {error && (
              <p className="px-2 py-1.5 text-xs text-destructive">
                {t("people.panel.employeePicker.searchFailed")}
              </p>
            )}
            {settled && people.length === 0 && (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("people.panel.employeePicker.noMatches")}
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** cmdk's value for the none row; ids never take it. */
const NONE = "none";

/** The API's longest search. */
const SEARCH_MAX_LENGTH = 100;

/** How long typing pauses before the search runs. */
const DEBOUNCE_MS = 200;
