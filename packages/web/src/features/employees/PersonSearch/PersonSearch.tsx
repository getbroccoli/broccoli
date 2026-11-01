import { Check } from "@phosphor-icons/react";
import { useState } from "react";

import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { t } from "@/i18n";

import { Avatar } from "../Avatar";
import { type PersonOption, personName } from "./personOption";

type Props = {
  label: string;
  search: string;
  onSearchChange: (search: string) => void;
  people: PersonOption[];
  /** The picked person's id; "" is none. */
  selectedId: string;
  /** Whether `people` answer what is typed now, so Enter never picks from a stale list. */
  settled: boolean;
  failed: boolean;
  /** Called with the person, or null for none. */
  onPick: (person: PersonOption | null) => void;
};

/**
 * A search box over people and the list it finds, to pick one or, before anything is typed, none.
 * The caller runs the search, so it works over employees and import employees alike.
 */
export function PersonSearch({
  label,
  search,
  onSearchChange,
  people,
  selectedId,
  settled,
  failed,
  onPick,
}: Props) {
  const [highlighted, setHighlighted] = useState(selectedId || NONE);
  const typing = search.trim() !== "";
  const options = [...(typing ? [] : [NONE]), ...people.map(({ id }) => id)];
  // New results replace the list, so the highlight falls back to its first row.
  const active = options.includes(highlighted) ? highlighted : (options[0] ?? "");
  const pick = (person: PersonOption | null) => {
    if (settled) onPick(person);
  };

  return (
    <Command shouldFilter={false} label={label} value={active} onValueChange={setHighlighted}>
      <CommandInput
        value={search}
        onValueChange={onSearchChange}
        placeholder={t("people.panel.employeePicker.search")}
        autoFocus
      />
      <CommandList>
        {!typing && (
          <CommandItem value={NONE} onSelect={() => pick(null)}>
            <span className="text-muted-foreground">{t("people.panel.employeePicker.none")}</span>
            {!selectedId && <Check aria-hidden className="ml-auto size-3.5" />}
          </CommandItem>
        )}
        {people.map((person) => (
          <CommandItem key={person.id} value={person.id} onSelect={() => pick(person)}>
            <Avatar
              url={person.avatarUrl}
              firstName={person.firstName ?? ""}
              lastName={person.lastName ?? ""}
              className="size-5 text-[9px]"
            />
            <span className="truncate">{personName(person)}</span>
            <span className="ml-auto truncate text-[11px] text-muted-foreground">
              {person.detail}
            </span>
            {person.id === selectedId && <Check aria-hidden className="size-3.5 shrink-0" />}
          </CommandItem>
        ))}
        {failed && (
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
  );
}

/** cmdk's value for the none row; ids never take it. */
const NONE = "none";
