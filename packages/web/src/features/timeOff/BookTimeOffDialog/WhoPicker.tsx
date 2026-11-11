import { CaretDown } from "@phosphor-icons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { type Person, PersonLine } from "./PersonLine";

type Props = {
  people: Person[];
  person: Person | undefined;
  onPick: (id: string) => void;
};

/** Picks who the booking is for, by name. */
export function WhoPicker({ people, person, onPick }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("justify-between font-normal", !person && "text-muted-foreground")}
          />
        }
      >
        {person ? <PersonLine person={person} /> : t("timeOff.dialog.pickSomeone")}
        <CaretDown aria-hidden className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command label={t("timeOff.dialog.who")}>
          <CommandInput placeholder={t("timeOff.dialog.searchPeople")} autoFocus />
          <CommandList>
            {people.map((option) => (
              <CommandItem
                key={option.id}
                value={`${option.firstName} ${option.lastName} ${option.id}`}
                onSelect={() => {
                  onPick(option.id);
                  setOpen(false);
                }}
              >
                <PersonLine person={option} />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
