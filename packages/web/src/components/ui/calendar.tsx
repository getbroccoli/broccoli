import * as React from "react";
import { DayPicker } from "react-day-picker";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

import { cn } from "@/lib/class-names";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

// The browser's locale names the month and weekdays, as the native date control does.
const captionFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const weekStartsOn = firstDayOfWeek();

/**
 * shadcn-style calendar on react-day-picker, themed to our tokens (brand-green
 * selection, neutral chrome). Used by the `DatePicker` popover so date fields
 * stop looking like the native browser control. See `date-picker.tsx`.
 */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      weekStartsOn={weekStartsOn}
      formatters={{
        formatCaption: (month) => captionFormat.format(month),
        formatWeekdayName: (weekday) => weekdayFormat.format(weekday),
      }}
      className={cn("p-3", className)}
      classNames={{
        months: "relative flex flex-col gap-4",
        month: "flex flex-col gap-3",
        month_caption: "relative flex h-7 items-center justify-center",
        caption_label: "text-[13px] font-medium",
        nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
        button_previous:
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30",
        button_next:
          "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-8 text-[11px] font-normal text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "size-8 p-0 text-center text-[13px]",
        day_button:
          "inline-flex size-8 items-center justify-center rounded-md font-normal transition-colors hover:bg-accent aria-selected:font-medium",
        selected: "[&>button]:bg-brand [&>button]:text-brand-foreground [&>button]:hover:bg-brand",
        today: "[&>button]:ring-1 [&>button]:ring-brand/40",
        outside: "[&:not([aria-selected=true])>button]:text-muted-foreground/40",
        disabled: "[&>button]:text-muted-foreground/30 [&>button]:line-through",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <CaretLeft size={14} weight="bold" />
          ) : (
            <CaretRight size={14} weight="bold" />
          ),
      }}
      {...props}
    />
  );
}

/** The locale's first day of the week, 0 for Sunday; undefined where the browser cannot tell. */
function firstDayOfWeek(): CalendarProps["weekStartsOn"] {
  const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  // `weekInfo` is the older Chromium and Safari spelling; firstDay counts Monday as 1 and Sunday as 7.
  const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
  return firstDay === undefined ? undefined : ((firstDay % 7) as CalendarProps["weekStartsOn"]);
}

export { Calendar };
