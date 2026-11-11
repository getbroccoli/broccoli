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
  const [choice, setChoice] = useState<DateOption>(defaultDate(terms));
  const [otherDate, setOtherDate] = useState("");
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const startDate = dateOf(choice, earliest, otherDate);
  const suggestions = useQuery(TermsPublishSuggestionsDocument, {
    variables: { id: terms.id, from: startDate },
    skip: !open || !startDate,
    fetchPolicy: "no-cache",
  }).data?.terms?.publishSuggestions;
  const owners = suggestions?.owners ?? [];
  const ticked = owners.filter((owner) => !unticked.has(ownerKey(owner)));
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
                    checked={!unticked.has(ownerKey(owner))}
                    onCheckedChange={(checked) =>
                      setUnticked(toggled(unticked, ownerKey(owner), checked))
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
          {startDate ? (
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

function ownerKey({ termsId, employeeId }: Owner): string {
  return termsId ? `terms:${termsId}` : `employee:${employeeId}`;
}

function toggled(keys: ReadonlySet<string>, key: string, checked: boolean): ReadonlySet<string> {
  const next = new Set(keys);
  if (checked) next.delete(key);
  else next.add(key);
  return next;
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
      versionOn(versions, today) !== null &&
      versionOn(versions, today)!.balance !== unpublished.balance,
  );
}

/** Rules start a leave year, as offering a type did; a week alone starts today. */
function defaultDate(terms: Terms): DateOption {
  return terms.timeOff.some(({ unpublished }) => unpublished !== null)
    ? "THIS_LEAVE_YEAR"
    : "TODAY";
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
      ? [rulesChangeBox(timeOffType.name, unpublished, versionOn(versions, startDate), startDate)]
      : [],
  );
  return [...week, ...rules];
}
