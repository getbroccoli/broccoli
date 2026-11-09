import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import {
  TermsTimeOffReachDocument,
  TermsWeekReachDocument,
  type TimeOffRulesInput,
} from "@/__generated__/graphql";

import { rulesInputOf } from "../TimeOffSettings";
import {
  asksForDate,
  rulesChangeBox,
  type RulesDraft,
  rulesDraftOf,
  rulesErrors,
  rulesSaveLine,
  rulesStartDate,
  stopChangeBox,
  stopSaveLine,
  weekChangeBox,
  type WeekDraft,
  weekDraftOf,
  weekErrors,
  weekSaveLine,
} from "./termsDraft";
import type { Terms, TimeOffRow } from "./termsQueries";
import { companyToday, splitVersions, versionOn } from "@/features/termsDisplay";
import { useSaveSection } from "./useSaveSection";

/** The section open for editing, with its form; `stop` when the form stops offering the type. */
export type OpenSection =
  | { kind: "week"; draft: WeekDraft }
  | { kind: "rules"; timeOffTypeId: string; draft: RulesDraft; stop?: boolean };

/**
 * Editing one set of terms in place: one section open at a time, opening another asks to discard
 * unsaved changes; what saving changes, whom it reaches, and saving it.
 */
export function useTermsEditing(terms: Terms) {
  const [chosen, setOpen] = useState<OpenSection | null>(null);
  // A type added from the panel opens once the reloaded terms list it; until then nothing is open.
  const open = chosen?.kind === "rules" && !hasRow(terms, chosen.timeOffTypeId) ? null : chosen;
  const [opened, setOpened] = useState<OpenSection | null>(null);
  const [waiting, setWaiting] = useState<OpenSection | null>(null);
  const { save, saving } = useSaveSection(terms);
  const facts = sectionFacts(terms, open);
  const people = useReach(terms.id, open, facts);
  // Changed from what the section opened with: only what saving sends, so typing a value back,
  // or a date left under an unpicked "Another date", is no change.
  const dirty =
    open !== null && savedValues(open, facts.earliest) !== savedValues(opened, facts.earliest);
  // An offer or a stop saves as it opened too: taking the type's default rules, or stopping, is the point of it.
  const savable =
    facts.valid && (dirty || (open?.kind === "rules" && (open.draft.offer || open.stop === true)));

  const show = (section: OpenSection | null) => {
    setOpen(section);
    setOpened(section);
    setWaiting(null);
  };
  const ask = (section: OpenSection) => (open && dirty ? setWaiting(section) : show(section));

  return {
    open,
    dirty,
    /** The section waiting while "discard your changes?" is asked. */
    waiting,
    saving,
    ...facts,
    people,
    box: savable ? changeBox(open, facts) : null,
    saveLine: open && facts.valid ? saveLineOf(terms, open, facts, people) : null,
    canSave: savable,
    editWeek: () =>
      facts.week &&
      ask({
        kind: "week",
        // Without a date the week applies from the leave year's start, so anyone added later
        // with an earlier start date has it.
        draft: weekDraftOf(
          facts.week,
          weekAsksForDate(terms) ? companyToday() : terms.workingPattern.earliestChange,
        ),
      }),
    editRules: (timeOffTypeId: string) =>
      ask({ kind: "rules", timeOffTypeId, draft: draftOf(terms, timeOffTypeId) }),
    offerType: ({ id, defaultRules }: { id: string; defaultRules: TimeOffRulesInput }) =>
      ask({ kind: "rules", timeOffTypeId: id, draft: rulesDraftOf(null, defaultRules) }),
    // A stop starts from the next leave year, so this year's booked time off stays.
    stopRules: (timeOffTypeId: string) =>
      ask({
        kind: "rules",
        timeOffTypeId,
        stop: true,
        draft: { ...draftOf(terms, timeOffTypeId), appliesFrom: "NEXT_LEAVE_YEAR" },
      }),
    change: setOpen,
    close: () => show(null),
    discard: () => show(waiting),
    keepEditing: () => setWaiting(null),
    save: async () => {
      if (open && facts.valid && (await save(open, facts.startDate))) show(null);
    },
  };
}

type SectionFacts = ReturnType<typeof sectionFacts>;

/** What the open section starts from: today's week or rules, the earliest date, the date picked. */
function sectionFacts(terms: Terms, open: OpenSection | null) {
  const today = companyToday();
  const week = splitVersions(terms.workingWeek, today).current;
  const row = open?.kind === "rules" ? rowOf(terms, open.timeOffTypeId) : null;
  const rowToday = row ? splitVersions(row.versions, today).current : null;
  const earliest =
    open?.kind === "week"
      ? terms.workingPattern.earliestChange
      : (row?.policy?.earliestChange ?? row?.earliestOffer ?? today);
  const startDate =
    open?.kind === "week" ? open.draft.startDate : open ? rulesStartDate(open.draft, earliest) : "";
  const errors =
    open?.kind === "week"
      ? weekErrors(open.draft, earliest)
      : open
        ? rulesErrors(open.draft, earliest)
        : null;
  const valid = errors !== null && Object.keys(errors).length === 0;
  // The rules the new ones follow on their date, which is today's unless a plan starts earlier.
  const rowBase = row ? (versionOn(row.versions, startDate) ?? rowToday) : null;
  const dated =
    open?.kind === "week"
      ? weekAsksForDate(terms)
      : open?.stop === true || asksForDate(terms.hadPeople, row?.versions ?? [], earliest);
  return { week, row, rowBase, earliest, startDate, valid, dated };
}

function weekAsksForDate(terms: Terms): boolean {
  return asksForDate(terms.hadPeople, terms.workingWeek, terms.workingPattern.earliestChange);
}

/** The people saving the open section reaches from its date, by name; null while they load. */
function useReach(
  termsId: string,
  open: OpenSection | null,
  { row, startDate, valid }: SectionFacts,
) {
  const week = useQuery(TermsWeekReachDocument, {
    variables: { id: termsId, from: startDate },
    skip: open?.kind !== "week" || !valid,
    fetchPolicy: "no-cache",
  });
  const timeOff = useQuery(TermsTimeOffReachDocument, {
    variables: {
      id: termsId,
      from: startDate,
      timeOffTypeId: row?.timeOffType.id ?? "",
      // A stopped type offered again reaches whoever its offer would.
      offer: !row?.policy || (open?.kind === "rules" && open.draft.offer),
    },
    skip: open?.kind !== "rules" || !valid,
    fetchPolicy: "no-cache",
  });
  if (open?.kind === "week") return week.data?.terms?.workingPattern.reach ?? null;
  const reached = timeOff.data?.terms?.timeOff.find(
    ({ timeOffType }) => open?.kind === "rules" && timeOffType.id === open.timeOffTypeId,
  );
  return reached ? (reached.policy?.reach ?? reached.offerReach ?? null) : null;
}

function changeBox(open: OpenSection | null, { row, rowBase, startDate, dated }: SectionFacts) {
  const date = dated ? startDate : null;
  if (open?.kind === "week") return weekChangeBox(open.draft, date);
  if (open?.stop && row) return stopChangeBox(row.timeOffType.name, startDate);
  return open && row ? rulesChangeBox(row.timeOffType.name, open.draft, rowBase, date) : null;
}

function saveLineOf(
  terms: Terms,
  open: OpenSection,
  { row, startDate, dated }: SectionFacts,
  people: unknown[] | null,
) {
  const count = people?.length ?? null;
  const date = dated ? startDate : null;
  if (open.kind === "week") return weekSaveLine(count, terms.name, date);
  return open.stop
    ? stopSaveLine(row!.timeOffType.name, count, terms.name, startDate)
    : rulesSaveLine(open.draft.offer, row!.timeOffType.name, count, terms.name, date);
}

/** What saving the section would send, as one comparable string. */
function savedValues(section: OpenSection | null, earliest: string): string {
  if (!section) return "";
  return section.kind === "week"
    ? JSON.stringify(section.draft)
    : JSON.stringify([rulesInputOf(section.draft), rulesStartDate(section.draft, earliest)]);
}

function hasRow(terms: Terms, timeOffTypeId: string): boolean {
  return terms.timeOff.some(({ timeOffType }) => timeOffType.id === timeOffTypeId);
}

function rowOf(terms: Terms, timeOffTypeId: string): TimeOffRow {
  return terms.timeOff.find(({ timeOffType }) => timeOffType.id === timeOffTypeId)!;
}

/** The type's rules form: from today's version, or its default rules for an offer. */
function draftOf(terms: Terms, timeOffTypeId: string) {
  const row = rowOf(terms, timeOffTypeId);
  return rulesDraftOf(
    splitVersions(row.versions, companyToday()).current,
    row.timeOffType.defaultRules,
  );
}
