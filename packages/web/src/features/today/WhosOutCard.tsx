import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { TodayPeopleQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";
import { dateRange } from "@/lib/formatDate";

import { teamOf } from "./team";
import { type Absence, whosOutSoon } from "./whosOutSoon";

type Person = TodayPeopleQuery["employees"]["edges"][number]["node"];
type Scope = "team" | "everyone";

type Props = { people: readonly Person[]; viewerId: string | null; today: string };

/** Others' approved time off today and in the next two weeks, for the viewer's team or everyone. */
export function WhosOutCard({ people, viewerId, today }: Props) {
  const team = viewerId ? teamOf(people, viewerId) : new Set<string>();
  const [scope, setScope] = useState<Scope>(team.size > 0 ? "team" : "everyone");
  const others = people.filter(
    ({ id }) => id !== viewerId && (scope === "everyone" || team.has(id)),
  );
  const out = whosOutSoon(others, today);
  const nobody = out.today.length === 0 && out.upcoming.length === 0;

  return (
    <Card
      title={t("today.out.title")}
      action={
        <>
          {team.size > 0 && (
            <div
              role="group"
              aria-label={t("today.out.scope")}
              className="flex rounded-lg bg-muted p-0.5"
            >
              {SCOPES.map((option) => (
                <Button
                  key={option}
                  size="xs"
                  variant={scope === option ? "outline" : "ghost"}
                  aria-pressed={scope === option}
                  onClick={() => setScope(option)}
                >
                  {t(`today.out.scope.${option}`)}
                </Button>
              ))}
            </div>
          )}
          <Link
            to="/time-off"
            search={{ month: today.slice(0, 7) }}
            className="text-sm font-medium hover:underline"
          >
            {t("today.out.seeAll")}
          </Link>
        </>
      }
    >
      {nobody ? (
        <p className="text-sm text-muted-foreground">{t("today.out.nobody")}</p>
      ) : (
        <>
          <AbsenceList label={t("today.out.today")} absences={out.today} />
          <AbsenceList label={t("today.out.upcoming")} absences={out.upcoming} />
        </>
      )}
    </Card>
  );
}

const SCOPES: Scope[] = ["team", "everyone"];
/** Per list; Time off shows everyone. */
const SHOWN = 8;

function AbsenceList({ label, absences }: { label: string; absences: Absence<Person>[] }) {
  if (absences.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </h3>
      <ul className="flex flex-col gap-3">
        {absences.slice(0, SHOWN).map(({ person, timeOff }) => (
          <li key={timeOff.id} className="flex items-center gap-3">
            <Avatar
              url={person.avatarUrl}
              firstName={person.firstName}
              lastName={person.lastName}
            />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm font-medium">
                {person.firstName} {person.lastName}
              </span>
              {/* The type is private to who may read the person's time off. */}
              <span className="truncate text-xs text-muted-foreground">
                {timeOff.timeOffType?.name ?? t("today.out.off")}
              </span>
            </div>
            <span className="text-sm whitespace-nowrap tabular-nums">
              {dateRange(timeOff.startDate, timeOff.endDate)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
