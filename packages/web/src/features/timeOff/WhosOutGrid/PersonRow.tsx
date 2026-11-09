import { Link } from "@tanstack/react-router";
import type { CSSProperties } from "react";

import { Avatar } from "@/features/employees";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { weekdayDay } from "../timeOffText";
import { BookingPart } from "./BookingPart";
import type { WhosOutPerson, WhosOutTimeOff } from "./WhosOutGrid";

type Props = {
  person: WhosOutPerson;
  columns: CSSProperties;
  onOpen: (timeOff: WhosOutTimeOff, person: WhosOutPerson) => void;
  onBook: ((employeeId: string, date: string) => void) | undefined;
};

/** One person's month: their days off, bank holidays and bookings, and free days to book. */
export function PersonRow({ person, columns, onOpen, onBook }: Props) {
  const fullName = `${person.firstName} ${person.lastName}`;
  return (
    <div
      role="row"
      className="grid min-w-max border-b border-border/60 last:border-b-0"
      style={columns}
    >
      <div
        role="rowheader"
        className="sticky left-0 z-10 flex items-center bg-background px-3 py-1.5"
      >
        <Link
          to="/people/$employeeId"
          params={{ employeeId: person.id }}
          className="flex min-w-0 items-center gap-2 text-[13px] hover:underline"
        >
          <Avatar
            url={person.avatarUrl ?? null}
            firstName={person.firstName}
            lastName={person.lastName}
            className="size-6 text-[9px]"
          />
          <span className="truncate">{fullName}</span>
        </Link>
      </div>
      {person.whosOut.days.map((day) => {
        const parts = person.whosOut.timeOff.flatMap((timeOff) =>
          timeOff.days
            .filter(({ date }) => date === day.date)
            .map(({ dayPart }) => ({ timeOff, dayPart })),
        );
        const free = day.kind === "WORKING_DAY" && parts.length === 0;
        return (
          <div
            key={day.date}
            role="cell"
            title={day.bankHolidayName ?? undefined}
            className={cn(
              "relative h-9 border-l border-border/40",
              day.kind === "NOT_A_WORKING_DAY" && "bg-muted/60",
              day.kind === "NOT_EMPLOYED" && "bg-muted",
              day.kind === "BANK_HOLIDAY" &&
                "bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_4px,transparent_4px_8px)]",
            )}
          >
            {parts.map(({ timeOff, dayPart }) => (
              <BookingPart
                key={`${timeOff.id}-${dayPart}`}
                timeOff={timeOff}
                dayPart={dayPart}
                first={timeOff.days[0]!.date === day.date}
                last={timeOff.days.at(-1)!.date === day.date}
                onOpen={() => onOpen(timeOff, person)}
              />
            ))}
            {free && onBook && (
              <button
                type="button"
                aria-label={t("timeOff.bookFor", { name: fullName, date: weekdayDay(day.date) })}
                onClick={() => onBook(person.id, day.date)}
                className="absolute inset-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
