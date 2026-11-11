import type { CSSProperties } from "react";

import type { WhosOutQuery } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { offCounts } from "../timeOffText";
import { PersonRow } from "./PersonRow";

export type WhosOutPerson = WhosOutQuery["employees"]["edges"][number]["node"];
export type WhosOutTimeOff = WhosOutPerson["whosOut"]["timeOff"][number];

type Props = {
  people: readonly WhosOutPerson[];
  range: { from: string; until: string };
  today: string;
  onOpen: (timeOff: WhosOutTimeOff, person: WhosOutPerson) => void;
  /** Set for who may book: a free working day books that person on that day. */
  onBook?: (employeeId: string, date: string) => void;
};

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });

/** One row per person and one column per day: days off, bank holidays and bookings. */
export function WhosOutGrid({ people, range, today, onOpen, onBook }: Props) {
  const dates = people[0]?.whosOut.days.map(({ date }) => date) ?? [];
  const counts = offCounts(people.map(({ whosOut }) => whosOut));
  const columns: CSSProperties = {
    gridTemplateColumns: `minmax(10rem, 13rem) repeat(${dates.length}, minmax(2rem, 1fr))`,
  };

  return (
    <div
      className="subtle-scrollbar overflow-x-auto rounded-xl border border-border"
      role="table"
      aria-label={`${range.from} – ${range.until}`}
    >
      <div className="grid min-w-max border-b border-border bg-sidebar" style={columns} role="row">
        <div
          role="columnheader"
          className="sticky left-0 z-10 bg-sidebar px-3 py-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {t("timeOff.offEachDay")}
        </div>
        {dates.map((date) => (
          <div
            key={date}
            role="columnheader"
            className="flex flex-col items-center py-1.5 text-[11px] text-muted-foreground"
          >
            <span>{WEEKDAY.format(Date.parse(date)).slice(0, 2)}</span>
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-md text-[12px] text-foreground",
                date === today && "bg-foreground font-medium text-background",
              )}
            >
              {Number(date.slice(8))}
            </span>
            <span aria-label={t("timeOff.offCount", { count: String(counts.get(date) ?? 0) })}>
              {counts.get(date) || " "}
            </span>
          </div>
        ))}
      </div>
      {people.map((person) => (
        <PersonRow
          key={person.id}
          person={person}
          columns={columns}
          onOpen={onOpen}
          onBook={onBook}
        />
      ))}
    </div>
  );
}
