import { useState } from "react";
import { CalendarBlank } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/class-names";
import { formatCalendarDate } from "@/lib/formatDate";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

/**
 * A `YYYY-MM-DD` date field: a button showing the date or a placeholder that
 * opens the `Calendar` in a popover, in place of the native `<input type=date>`.
 */
export function DatePicker({
  value,
  onChange,
  placeholder,
  autoFocus,
  "aria-label": label,
  "aria-invalid": invalid,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = toDate(value);
  const shown = selected ? formatCalendarDate(value) : placeholder;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            // The label alone would hide the chosen date from screen readers.
            aria-label={label && `${label}: ${shown}`}
            aria-invalid={invalid}
            variant="outline"
            autoFocus={autoFocus}
            className={cn(
              "min-w-0 flex-1 justify-start gap-2 font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarBlank className="text-muted-foreground" />
            {shown}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            onChange(date ? toCalendarDate(date) : "");
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

// The calendar works in local dates, so the day never shifts with the time zone.
function toDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : undefined;
}

function toCalendarDate(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
