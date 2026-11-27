import { useFragment, useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";

import { Today_EmployeeFragmentDoc, TodayPeopleDocument } from "@/__generated__/graphql";
import { TasksNeedingYouCard } from "@/features/tasks";
import { companyToday } from "@/features/termsDisplay";
import { t } from "@/i18n";
import { utcDay } from "@/lib/calendarDay";
import { PageHeader } from "@/shell";

import { ComingUpCard } from "./ComingUpCard";
import { fortnightFrom } from "./fortnightFrom";
import { MyTimeOffCard } from "./MyTimeOffCard";
import { partOfDay } from "./partOfDay";
import { WhosOutCard } from "./WhosOutCard";

const DATE_TITLE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** The home page: what needs the person, who is out, their own time off and who starts soon. */
export function TodayPage() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  // The session already read the employee, so the greeting renders at once.
  const employee = useFragment({ fragment: Today_EmployeeFragmentDoc, from: me.employee });
  const firstName = me.employee && employee.complete ? employee.data.firstName : null;
  const viewerId = me.employee?.id ?? null;
  const part = partOfDay(new Date());
  const today = companyToday();
  // Time off and Tasks change it without a write here, so revisits read it again.
  const people = useQuery(TodayPeopleDocument, {
    variables: fortnightFrom(today),
    fetchPolicy: "cache-and-network",
  }).data?.employees.edges.map(({ node }) => node);

  return (
    <div className="flex max-w-6xl flex-col">
      <PageHeader
        title={
          firstName
            ? t(`today.greeting.${part}.named`, { name: firstName })
            : t(`today.greeting.${part}`)
        }
        description={DATE_TITLE.format(utcDay(today))}
      />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-4">
          <TasksNeedingYouCard />
          {people && <WhosOutCard people={people} viewerId={viewerId} today={today} />}
        </div>
        <div className="flex flex-col gap-4">
          {viewerId && <MyTimeOffCard employeeId={viewerId} today={today} />}
          {people && <ComingUpCard people={people} today={today} />}
        </div>
      </div>
    </div>
  );
}
