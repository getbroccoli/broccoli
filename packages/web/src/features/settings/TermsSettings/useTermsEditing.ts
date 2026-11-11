import { useState } from "react";

import { rulesInputOf } from "../TimeOffSettings";
import {
  DEFAULT_WEEK,
  type RulesDraft,
  rulesDraftOf,
  rulesErrors,
  type WeekDraft,
  weekDraftOf,
  weekErrors,
} from "./termsDraft";
import type { Terms, TimeOffRow } from "./termsQueries";
import { companyToday, splitVersions } from "@/features/termsDisplay";
import { useSaveSection } from "./useSaveSection";

/** The section open for editing, with its form. */
export type OpenSection =
  { kind: "week"; draft: WeekDraft } | { kind: "rules"; timeOffTypeId: string; draft: RulesDraft };

/**
 * Editing one set of terms in place: one section open at a time, opening another asks to discard
 * unsaved changes; saving keeps the section's changes unpublished.
 */
export function useTermsEditing(terms: Terms) {
  const [open, setOpen] = useState<OpenSection | null>(null);
  const [opened, setOpened] = useState<OpenSection | null>(null);
  const [waiting, setWaiting] = useState<OpenSection | null>(null);
  const { save, saving } = useSaveSection(terms);
  const week = splitVersions(terms.workingWeek, companyToday()).current;
  const row = open?.kind === "rules" ? rowOf(terms, open.timeOffTypeId) : null;
  const valid = open !== null && Object.keys(errorsOf(open)).length === 0;
  // Changed from what the section opened with: only what saving sends, so typing a value back is no change.
  const dirty = open !== null && savedValues(open) !== savedValues(opened);
  // An offer saves as it opened too: taking the type's default rules is the point of it.
  const savable = valid && (dirty || (open?.kind === "rules" && open.draft.offer));

  const show = (section: OpenSection | null) => {
    setOpen(section);
    setOpened(section);
    setWaiting(null);
  };
  const ask = (section: OpenSection) => (open && dirty ? setWaiting(section) : show(section));
  // Terms without a week, such as new terms whose draft was discarded, start from Mon–Fri.
  const weekShown = terms.unpublishedWorkingWeek ?? week ?? DEFAULT_WEEK;

  return {
    open,
    dirty,
    /** The section waiting while "discard your changes?" is asked. */
    waiting,
    saving,
    /** The week the terms work today; null while they work none. */
    week,
    /** The open type's row; null while no type is open. */
    row,
    canSave: savable,
    editWeek: () => ask({ kind: "week", draft: weekDraftOf(weekShown) }),
    editRules: (timeOffTypeId: string) =>
      ask({ kind: "rules", timeOffTypeId, draft: draftOf(rowOf(terms, timeOffTypeId)) }),
    change: setOpen,
    close: () => show(null),
    discard: () => show(waiting),
    keepEditing: () => setWaiting(null),
    save: async () => {
      if (open && valid && (await save(open))) show(null);
    },
  };
}

function errorsOf(open: OpenSection) {
  return open.kind === "week" ? weekErrors(open.draft) : rulesErrors(open.draft);
}

/** What saving the section would send, as one comparable string. */
function savedValues(section: OpenSection | null): string {
  if (!section) return "";
  return JSON.stringify(section.kind === "week" ? section.draft : rulesInputOf(section.draft));
}

function rowOf(terms: Terms, timeOffTypeId: string): TimeOffRow {
  return terms.timeOff.find(({ timeOffType }) => timeOffType.id === timeOffTypeId)!;
}

/** The type's rules form: from its unpublished rules, else today's, else its default rules. */
function draftOf(row: TimeOffRow) {
  const current = splitVersions(row.versions, companyToday()).current;
  return rulesDraftOf(row.unpublished ?? current, row.timeOffType.defaultRules, current === null);
}
