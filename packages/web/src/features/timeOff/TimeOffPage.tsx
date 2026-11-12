import { useQuery } from "@apollo/client/react";
import { CalendarPlus, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";

import { WhosOutDocument, WorkspaceMenuDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { companyToday } from "@/features/termsDisplay";
import { t } from "@/i18n";

import { BookingDetailsDialog } from "./BookingDetailsDialog";
import { BookTimeOffDialog } from "./BookTimeOffDialog";
import { monthRange, shiftMonth } from "./timeOffText";
import { WhosOutGrid } from "./WhosOutGrid";

const MONTH_TITLE = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Everyone's time off, a month at a time; admins book from here. */
export function TimeOffPage() {
  const { month, book } = useSearch({ from: "/_authenticated/time-off" });
  const navigate = useNavigate({ from: "/time-off" });
  const { me } = useRouteContext({ from: "/_authenticated" });
  // shortcut: booking follows the admin grant until profiles grant `time_off.create` by scope.
  const canBook = me.operations.includes("MANAGE_WORKSPACE");
  const range = monthRange(month);
  const { data, error, refetch } = useQuery(WhosOutDocument, { variables: range });
  const company = useQuery(WorkspaceMenuDocument, { fetchPolicy: "cache-first" }).data?.company;
  const [filter, setFilter] = useState("");
  const query = useDeferredValue(filter.trim().toLowerCase());
  // The id only: the booking is found in the month shown, which may still be loading.
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [localBooking, setBooking] = useState<{ employeeId?: string; date?: string } | null>(null);
  // `?book=<id>` (from a person's panel) opens the dialog for them, and Back closes it again.
  const booking = localBooking ?? (book ? { employeeId: book } : null);
  const people = (data?.employees.edges ?? [])
    .map(({ node }) => node)
    .filter(({ whosOut }) => whosOut.days.some(({ kind }) => kind !== "NOT_EMPLOYED"));
  const shown = people.filter(({ firstName, lastName }) =>
    `${firstName} ${lastName}`.toLowerCase().includes(query),
  );
  const goTo = (next: string) =>
    void navigate({ search: (previous) => ({ ...previous, month: next }) });
  const opened = people
    .flatMap((person) => person.whosOut.timeOff.map((timeOff) => ({ timeOff, person })))
    .find(({ timeOff }) => timeOff.id === openedId);
  const closeBooking = () => {
    setBooking(null);
    if (book) void navigate({ search: (previous) => ({ ...previous, book: undefined }) });
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 pb-6">
        <title>{`${t("timeOff.title")} · ${t("app.name")}`}</title>
        <div className="flex flex-col gap-1">
          <h1
            tabIndex={-1}
            className="text-[26px] leading-tight font-semibold tracking-tight outline-none"
          >
            {t("timeOff.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {company?.name
              ? t("timeOff.subtitle", { company: company.name })
              : t("timeOff.subtitleNoCompany")}
          </p>
        </div>
        {canBook && (
          <Button onClick={() => setBooking({})}>
            <CalendarPlus aria-hidden />
            {t("timeOff.book")}
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 pb-4">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("timeOff.previousMonth")}
          onClick={() => goTo(shiftMonth(month, -1))}
        >
          <CaretLeft aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("timeOff.nextMonth")}
          onClick={() => goTo(shiftMonth(month, 1))}
        >
          <CaretRight aria-hidden />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => goTo(companyToday().slice(0, 7))}>
          {t("timeOff.today")}
        </Button>
        <h2 className="text-[15px] font-medium">{MONTH_TITLE.format(Date.parse(range.from))}</h2>
        <Input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("timeOff.filter")}
          aria-label={t("timeOff.filter")}
          className="max-sm:w-full sm:ml-auto sm:w-56"
        />
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">
          {t("timeOff.loadFailed")}{" "}
          <Button variant="link" onClick={() => void refetch()}>
            {t("timeOff.retry")}
          </Button>
        </p>
      ) : data && people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("timeOff.nobodyThisMonth")}</p>
      ) : data && shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("timeOff.nobodyByThatName")}</p>
      ) : (
        data && (
          <WhosOutGrid
            people={shown}
            range={range}
            today={companyToday()}
            onOpen={(timeOff) => setOpenedId(timeOff.id)}
            onBook={canBook ? (employeeId, date) => setBooking({ employeeId, date }) : undefined}
          />
        )
      )}

      {booking && (
        <BookTimeOffDialog
          employeeId={booking.employeeId}
          date={booking.date}
          viewerEmployeeId={me.employee?.id ?? null}
          onClose={closeBooking}
          onOpenBooking={(timeOffId, date) => {
            setOpenedId(timeOffId);
            // The clash shows once its month is on the page and holds it, booked since or not.
            if (date.slice(0, 7) === month) void refetch();
            else goTo(date.slice(0, 7));
          }}
        />
      )}
      {opened && (
        <BookingDetailsDialog
          employeeId={opened.person.id}
          timeOff={opened.timeOff}
          person={opened.person}
          canCancel={canBook}
          onClose={() => setOpenedId(null)}
        />
      )}
    </>
  );
}
