import { useQuery } from "@apollo/client/react";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import {
  BookingCompanyTypesDocument,
  BookingPersonTypesDocument,
  type BookingPersonTypesQuery,
  type TimeOffBookInput,
  TimeOffBookingPreviewDocument,
  type TimeOffBookingPreviewQuery,
  type TimeOffDayPart,
} from "@/__generated__/graphql";

type PersonType = NonNullable<
  NonNullable<BookingPersonTypesQuery["employee"]>["timeOffTypes"]
>[number];
type Preview = TimeOffBookingPreviewQuery["timeOffBookingPreview"];

/** A type the dialog offers: the person's with this year's figures, or another company type. */
export type BookingType = Pick<PersonType, "timeOffType"> &
  Partial<Pick<PersonType, "balance" | "entitlement" | "remaining">>;

/** What the Book time off dialog's fields hold, with the person's types and the API's preview. */
export interface BookingDraft {
  employeeId: string;
  pickPerson: (id: string) => void;
  /** The person's types first, then the company's others; undefined until they load. */
  types: BookingType[] | undefined;
  typeId: string;
  setTypeId: (id: string) => void;
  range: { from: string; until: string } | null;
  setRange: (range: { from: string; until: string } | null) => void;
  setHalfDay: (date: string, part: TimeOffDayPart) => void;
  note: string;
  setNote: (note: string) => void;
  /** What the API books; null until person, type and dates are set. */
  input: TimeOffBookInput | null;
  /** The preview to show: the current one, else the last while the next loads. */
  preview: Preview | undefined;
  /** The preview of exactly `input`, the only one that may be booked. */
  currentPreview: Preview | undefined;
  previewFailed: boolean;
  /** Asks the API again for the person's types and the current input's preview. */
  refresh: () => void;
}

/** The dialog's state, starting from the person and day it was opened with. */
export function useBookingDraft(initial: { employeeId?: string; date?: string }): BookingDraft {
  const [employeeId, setEmployeeId] = useState(initial.employeeId ?? "");
  const [chosenTypeId, setChosenTypeId] = useState("");
  const [range, setRange] = useState<{ from: string; until: string } | null>(
    initial.date ? { from: initial.date, until: initial.date } : null,
  );
  const [halfDays, setHalfDays] = useState<Map<string, TimeOffDayPart>>(new Map());
  const [note, setNote] = useState("");
  const { types, refetchTypes } = useBookingTypes(employeeId);
  // The person's types come first, Annual leave before the rest, so it is the default. A chosen
  // type that disappears on a refresh is unchosen, never swapped for another the person didn't pick.
  const typeId = chosenTypeId
    ? types && !types.some(({ timeOffType }) => timeOffType.id === chosenTypeId)
      ? ""
      : chosenTypeId
    : (types?.[0]?.timeOffType.id ?? "");
  const shownHalfDays = [...halfDays].filter(
    ([date]) => range && range.from <= date && date <= range.until,
  );
  // The note changes no cost, so it stays out of the preview's variables.
  const previewInput =
    employeeId && typeId && range
      ? {
          employeeId,
          timeOffTypeId: typeId,
          startDate: range.from,
          endDate: range.until,
          halfDays: shownHalfDays.map(([date, dayPart]) => ({ date, dayPart })),
        }
      : null;
  const preview = useQuery(TimeOffBookingPreviewDocument, {
    variables: { input: previewInput! },
    skip: !previewInput,
    // Bookings by others and cancellations change it, so it is never read from the cache.
    fetchPolicy: "network-only",
  });
  const current = preview.loading ? undefined : preview.data?.timeOffBookingPreview;
  return {
    employeeId,
    pickPerson: (id: string) => {
      setEmployeeId(id);
      setChosenTypeId("");
      // Half days belong to the last person's working days.
      setHalfDays(new Map());
    },
    types,
    typeId,
    setTypeId: setChosenTypeId,
    range,
    setRange,
    setHalfDay: (date: string, part: TimeOffDayPart) =>
      setHalfDays((previous) => {
        const next = new Map(previous);
        if (part === "FULL_DAY") next.delete(date);
        else next.set(date, part);
        return next;
      }),
    note,
    setNote,
    input: previewInput && { ...previewInput, note: note.trim() || null },
    preview: current ?? preview.previousData?.timeOffBookingPreview,
    currentPreview: current,
    previewFailed: Boolean(preview.error),
    refresh: () => {
      void refetchTypes();
      void preview.refetch();
    },
  };
}

/** The person's types with their figures, then every other company type. */
function useBookingTypes(employeeId: string): {
  types: BookingType[] | undefined;
  refetchTypes: () => Promise<unknown>;
} {
  const { me } = useRouteContext({ from: "/_authenticated" });
  // Only admins read every company type; whoever else asks for time off gets their own types.
  const admin = me.operations.includes("MANAGE_WORKSPACE");
  const ownQuery = useQuery(BookingPersonTypesDocument, {
    variables: { id: employeeId },
    skip: !employeeId,
    // A decision in Tasks changes the figures without a write here.
    fetchPolicy: "cache-and-network",
  });
  const own = ownQuery.data?.employee?.timeOffTypes;
  const company = useQuery(BookingCompanyTypesDocument, { skip: !admin }).data?.timeOffSettings
    .timeOffTypes;
  const refetchTypes = () => ownQuery.refetch();
  if (!own || (admin && !company)) {
    return { types: undefined, refetchTypes };
  }
  const others = (company ?? []).filter(
    ({ timeOffType }) => !own.some((type) => type.timeOffType.id === timeOffType.id),
  );
  return { types: [...own, ...others], refetchTypes };
}
