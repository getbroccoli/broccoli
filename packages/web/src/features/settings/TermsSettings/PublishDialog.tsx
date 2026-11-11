import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { TermsPublishSuggestionsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { companyToday, shortDate, versionOn } from "@/features/termsDisplay";

import { DateChoice } from "./DateChoice";
import {
  type ChangeBox,
  longDate,
  nextLeaveYear,
  peopleText,
  rulesChangeBox,
  stopChangeBox,
  weekChangeBox,
} from "./termsDraft";
import type { Terms } from "./termsQueries";
import type { PublishChoice } from "./usePublishTerms";
import { WhatChanges } from "./WhatChanges";

type Props = {
  terms: Terms;
  open: boolean;
  onClose: () => void;
  publish: (choice: PublishChoice) => Promise<boolean>;
  publishing: boolean;
};

type DateOption = "THIS_LEAVE_YEAR" | "TODAY" | "NEXT_LEAVE_YEAR" | "ANOTHER_DATE";

/**
 * Publishing the terms' unpublished week and rules: from when, to whom (these terms and others
 * using what they replace, all ticked), and the people it reaches.
 */
export function PublishDialog({ terms, open, onClose, publish, publishing }: Props) {
  const earliest = terms.earliestChange;
  const countsChange = changesCounts(terms);
  // Every change starts today unless picked otherwise; one that changes how a type counts starts a leave year.
  const [choice, setChoice] = useState<DateOption>(countsChange ? "THIS_LEAVE_YEAR" : "TODAY");
  const [otherDate, setOtherDate] = useState("");
  // The admin's own ticks; any other owner sharing only stopped rules starts unticked, so a stop
  // ends the type only where it was made, whichever date lists that owner.
  const [choices, setChoices] = useState<ReadonlyMap<string, boolean>>(new Map());
  const startDate = dateOf(choice, earliest, otherDate);
  const read = useQuery(TermsPublishSuggestionsDocument, {
    variables: { id: terms.id, from: startDate },
    skip: !open || !startDate,
    fetchPolicy: "no-cache",
  });
  const suggestions = read.data?.terms?.publishSuggestions;
  const owners = suggestions?.owners ?? [];
  const stoppedOnly = onlyStoppedFor(terms, owners);
  const isTicked = (owner: Owner) =>
    choices.get(ownerKey(owner)) ?? !stoppedOnly.has(ownerKey(owner));
  const ticked = owners.filter(isTicked);
  const people = suggestions ? reachedBy(ticked) : null;

  const confirm = async () => {
    if (!suggestions || !startDate) return;
    const published = await publish({
      startDate,
      owners: ticked.map(({ termsId, employeeId }) => ({ termsId, employeeId })),
    });
    if (published) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && !publishing && onClose()}>
      <DialogContent className="sm:max-w-xl" closeLabel={t("terms.close")}>
        <DialogTitle className="text-lg">
          {t("terms.publish.title", { terms: terms.name })}
        </DialogTitle>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto">
          {owners.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">{t("terms.publish.applyTo")}</legend>
              {owners.map((owner) => (
                <label key={ownerKey(owner)} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={isTicked(owner)}
                    onCheckedChange={(checked) =>
                      setChoices(new Map(choices).set(ownerKey(owner), checked))
                    }
                  />
                  <span className="flex-1">{owner.name}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {owner.termsId
                      ? t("terms.publish.termsOwner", { people: peopleCount(owner.reached.length) })
                      : t("terms.publish.personOwner")}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <DateChoice
            name="publish-start"
            options={dateOptions(earliest, countsChange)}
            selected={choice}
            onSelect={setChoice}
            hint={t(countsChange ? "terms.publish.countsHint" : "terms.publish.dateHint")}
            error={
              startDate && startDate < earliest
                ? t("terms.edit.tooEarly", { date: shortDate(earliest) })
                : undefined
            }
            picker={
              !countsChange && (
                <DatePicker
                  value={otherDate}
                  fromDate={earliest}
                  placeholder={t("terms.edit.pickDate")}
                  aria-label={t("terms.edit.pickDate")}
                  onChange={setOtherDate}
                />
              )
            }
          />
          {read.error ? (
            <div className="flex items-center gap-3 text-sm">
              <p className="text-destructive">{t("terms.publish.loadFailed")}</p>
              <Button variant="outline" size="sm" onClick={() => void read.refetch()}>
                {t("terms.retry")}
              </Button>
            </div>
          ) : startDate ? (
            <WhatChanges changes={changesOf(terms, startDate)} people={people} />
          ) : (
            <Skeleton className="h-24 w-full" />
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">
            {startDate &&
              (ticked.length === 0
                ? t("terms.publish.footerNobody")
                : people?.length === 0
                  ? t("terms.publish.footerNoPeople", { date: longDate(startDate) })
                  : t("terms.publish.footer", {
                      people: peopleText(people?.length ?? null),
                      date: longDate(startDate),
                    }))}
          </p>
          <div className="flex gap-2">
            <DialogClose render={<Button type="button" variant="outline" disabled={publishing} />}>
              {t("terms.edit.cancel")}
            </DialogClose>
            <Button
              onClick={() => void confirm()}
              disabled={!suggestions || ticked.length === 0 || publishing}
            >
              {t("terms.publish.publish")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Owner = { termsId?: string | null; employeeId?: string | null };
type Reached = { id: string; firstName: string; lastName: string };

/** "1 person", "6 people". */
function peopleCount(count: number): string {
  return count === 1
    ? t("terms.publish.reachOne")
    : t("terms.publish.reach", { count: String(count) });
}

/** Owners other than these terms that would only get stops. */
function onlyStoppedFor(
  terms: Terms,
  owners: readonly (Owner & { versionIds: readonly string[] })[],
): ReadonlySet<string> {
  const stops = new Set(
    terms.timeOff.flatMap(({ unpublished }) => (unpublished?.stops ? [unpublished.id] : [])),
  );
  return new Set(
    owners
      .filter(
        (owner) =>
          owner.termsId !== terms.id &&
          owner.versionIds.length > 0 &&
          owner.versionIds.every((id) => stops.has(id)),
      )
      .map(ownerKey),
  );
}

function ownerKey({ termsId, employeeId }: Owner): string {
  return termsId ? `terms:${termsId}` : `employee:${employeeId}`;
}

/** Everyone the ticked owners reach, once each, by name. */
function reachedBy(owners: readonly { reached: readonly Reached[] }[]): Reached[] {
  const people = new Map(
    owners.flatMap(({ reached }) => reached.map((person) => [person.id, person])),
  );
  return [...people.values()].toSorted((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`),
  );
}

/** Whether an unpublished type's rules count it differently from today's, so they start a leave year. */
function changesCounts(terms: Terms): boolean {
  const today = companyToday();
  return terms.timeOff.some(
    ({ unpublished, versions }) =>
      unpublished !== null &&
      !unpublished.stops &&
      versionOn(versions, today) !== null &&
      versionOn(versions, today)!.balance !== unpublished.balance,
  );
}

function dateOptions(earliest: string, countsChange: boolean) {
  const leaveYears = [
    { value: "THIS_LEAVE_YEAR" as const, label: shortDate(earliest) },
    { value: "NEXT_LEAVE_YEAR" as const, label: shortDate(nextLeaveYear(earliest)) },
  ];
  // shortcut: every leave year starts on 1 January; offer the policy's own starts once they can differ.
  return countsChange
    ? leaveYears
    : [
        { value: "TODAY" as const, label: t("terms.edit.today") },
        ...leaveYears,
        { value: "ANOTHER_DATE" as const, label: t("terms.edit.otherDate") },
      ];
}

function dateOf(choice: DateOption, earliest: string, otherDate: string): string {
  switch (choice) {
    case "THIS_LEAVE_YEAR":
      return earliest;
    case "TODAY":
      return companyToday();
    case "NEXT_LEAVE_YEAR":
      return nextLeaveYear(earliest);
    case "ANOTHER_DATE":
      return otherDate;
  }
}

/** What publishing from `startDate` changes on these terms: the week, then each type in list order. */
function changesOf(terms: Terms, startDate: string): ChangeBox[] {
  const week = terms.unpublishedWorkingWeek
    ? [weekChangeBox(terms.unpublishedWorkingWeek, startDate)]
    : [];
  const rules = terms.timeOff.flatMap(({ timeOffType, unpublished, versions }) =>
    unpublished
      ? [
          unpublished.stops
            ? stopChangeBox(timeOffType.name, startDate)
            : rulesChangeBox(
                timeOffType.name,
                unpublished,
                versionOn(versions, startDate),
                startDate,
              ),
        ]
      : [],
  );
  return [...week, ...rules];
}
