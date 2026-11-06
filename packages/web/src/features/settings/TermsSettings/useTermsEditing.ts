import { useQuery } from "@apollo/client/react";
import { useState } from "react";

import { TermsTimeOffReachDocument, TermsWeekReachDocument } from "@/__generated__/graphql";

import {
  rulesChangeBox,
  type RulesDraft,
  rulesDraftOf,
  rulesErrors,
  rulesSaveLine,
  rulesStartDate,
  weekChangeBox,
  type WeekDraft,
  weekDraftOf,
  weekErrors,
  weekSaveLine,
} from "./termsDraft";
import type { Terms, TimeOffRow } from "./termsQueries";
import { companyToday, splitVersions } from "./termsText";
import { useSaveSection } from "./useSaveSection";

/** The section open for editing, with its form. */
export type OpenSection =
  { kind: "week"; draft: WeekDraft } | { kind: "rules"; timeOffTypeId: string; draft: RulesDraft };

/**
 * Editing one set of terms in place: one section open at a time, opening another asks to discard
 * unsaved changes; what saving changes, whom it reaches, and saving it.
 */
export function useTermsEditing(terms: Terms) {
  const [open, setOpen] = useState<OpenSection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [waiting, setWaiting] = useState<OpenSection | null>(null);
  const { save, saving } = useSaveSection(terms);
  const facts = sectionFacts(terms, open);
  const people = useReach(terms.id, open, facts);

  const show = (section: OpenSection | null) => {
    setOpen(section);
    setDirty(false);
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
    box: dirty && facts.valid ? changeBox(open, facts) : null,
    saveLine: open && facts.valid ? saveLineOf(terms, open, facts, people) : null,
    canSave: facts.valid && dirty,
    editWeek: () =>
      facts.week && ask({ kind: "week", draft: weekDraftOf(facts.week, companyToday()) }),
    editRules: (timeOffTypeId: string) =>
      ask({ kind: "rules", timeOffTypeId, draft: rulesDraftOf(currentOf(terms, timeOffTypeId)) }),
    change: (section: OpenSection) => {
      setOpen(section);
      setDirty(true);
    },
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
  const rowCurrent = row ? splitVersions(row.versions, today).current : null;
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
  return { week, row, rowCurrent, earliest, startDate, valid };
}

/** The people saving the open section reaches from its date, by name; null while they load. */
function useReach(termsId: string, open: OpenSection | null, { startDate, valid }: SectionFacts) {
  const variables = { id: termsId, from: startDate };
  const week = useQuery(TermsWeekReachDocument, {
    variables,
    skip: open?.kind !== "week" || !valid,
    fetchPolicy: "no-cache",
  });
  const timeOff = useQuery(TermsTimeOffReachDocument, {
    variables,
    skip: open?.kind !== "rules" || !valid,
    fetchPolicy: "no-cache",
  });
  if (open?.kind === "week") return week.data?.terms?.workingPattern.reach ?? null;
  const row = timeOff.data?.terms?.timeOff.find(
    ({ timeOffType }) => open?.kind === "rules" && timeOffType.id === open.timeOffTypeId,
  );
  return row ? (row.policy?.reach ?? row.offerReach) : null;
}

function changeBox(open: OpenSection | null, { row, rowCurrent, startDate }: SectionFacts) {
  if (open?.kind === "week") return weekChangeBox(open.draft);
  return open && row
    ? rulesChangeBox(row.timeOffType.name, open.draft, rowCurrent, startDate)
    : null;
}

function saveLineOf(
  terms: Terms,
  open: OpenSection,
  { row, startDate }: SectionFacts,
  people: unknown[] | null,
) {
  const count = people?.length ?? null;
  return open.kind === "week"
    ? weekSaveLine(count, terms.name, startDate)
    : rulesSaveLine(open.draft.offer, row!.timeOffType.name, count, terms.name, startDate);
}

function rowOf(terms: Terms, timeOffTypeId: string): TimeOffRow {
  return terms.timeOff.find(({ timeOffType }) => timeOffType.id === timeOffTypeId)!;
}

function currentOf(terms: Terms, timeOffTypeId: string) {
  return splitVersions(rowOf(terms, timeOffTypeId).versions, companyToday()).current;
}
