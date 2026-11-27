import type { TodayPeopleQuery } from "@/__generated__/graphql";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";
import { weekdayDay } from "@/lib/formatDate";

import { comingUp, type ComingUpEvent } from "./comingUp";

type Person = TodayPeopleQuery["employees"]["edges"][number]["node"];

type Props = { people: readonly Person[]; today: string };

/** Who starts and whose work anniversary falls in the next two weeks; nothing when there is none. */
export function ComingUpCard({ people, today }: Props) {
  const events = comingUp(people, today).slice(0, SHOWN);
  if (events.length === 0) return null;
  return (
    <Card title={t("today.comingUp.title")}>
      <ul className="flex flex-col gap-3">
        {events.map((event) => (
          <li key={`${event.kind}-${event.person.id}`} className="flex items-center gap-3">
            <Avatar
              url={event.person.avatarUrl}
              firstName={event.person.firstName}
              lastName={event.person.lastName}
            />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-medium">
                {event.person.firstName} {event.person.lastName}
              </span>
              <span className="truncate text-xs text-muted-foreground">{whatHappens(event)}</span>
            </div>
            <span className="text-sm whitespace-nowrap">{weekdayDay(event.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** A big company has many anniversaries; Today names the first few. */
const SHOWN = 6;

function whatHappens(event: ComingUpEvent<Person>): string {
  if (event.kind === "STARTS") return t("today.comingUp.starts");
  return t(event.years === 1 ? "today.comingUp.year" : "today.comingUp.years", {
    count: String(event.years),
  });
}
