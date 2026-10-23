import type { RecordHistoryQuery } from "@/__generated__/graphql";
import { type MessageKey, t } from "@/i18n";

import type { RecordDescription } from "./recordDescription";

/** A history line as the `RecordHistory` query reads it; `occurredAt` is an ISO instant in UTC. */
export type HistoryLine = RecordHistoryQuery["recordHistory"]["edges"][number]["node"];

/** What a history line says, before it is rendered. */
export type Summary =
  | { kind: "changed"; label: string; oldValue: string | null; newValue: string | null }
  | { kind: "updatedMany"; labels: string[] }
  | { kind: "created"; title: string | null; labels: string[] }
  | { kind: "deleted"; title: string | null };

/** Lines in their order, grouped by calendar day in `timeZone`: "Today", "Yesterday", "21 Oct". */
export function groupByDay<Line extends Pick<HistoryLine, "occurredAt">>(
  lines: Line[],
  now: Date,
  timeZone?: string,
): { label: string; lines: Line[] }[] {
  const today = dayOf(now, timeZone);
  const [year, month, date] = dayParts(today);
  const yesterday = new Date(Date.UTC(year, month, date - 1)).toISOString().slice(0, 10);
  const groups: { day: string; label: string; lines: Line[] }[] = [];
  for (const line of lines) {
    const day = dayOf(new Date(line.occurredAt), timeZone);
    const last = groups.at(-1);
    if (last?.day === day) {
      last.lines.push(line);
      continue;
    }
    groups.push({ day, label: dayLabel(day, today, yesterday), lines: [line] });
  }
  return groups.map(({ label, lines }) => ({ label, lines }));
}

/** What a line changed, with field labels and values as the record type shows them. */
export function summaryOf(line: HistoryLine, description: RecordDescription): Summary {
  const fieldOf = (key: string) => description.fields.find((field) => field.key === key);
  const labelOf = (key: string) => fieldOf(key)?.label ?? sentenceCase(key);
  const labels = line.changes.map(({ field }) => labelOf(field));
  const titleChange = line.changes.find(({ field }) => field === description.titleField);
  switch (line.operation) {
    case "CREATED":
      return { kind: "created", title: titleChange?.newValue ?? null, labels };
    case "DELETED":
      return { kind: "deleted", title: titleChange?.oldValue ?? null };
    case "UPDATED": {
      if (line.changes.length !== 1) {
        return { kind: "updatedMany", labels };
      }
      const [{ field, oldValue, newValue }] = line.changes as [HistoryLine["changes"][number]];
      const format = fieldOf(field)?.format ?? ((value: string) => value);
      return {
        kind: "changed",
        label: labelOf(field),
        oldValue: oldValue === null ? null : format(oldValue),
        newValue: newValue === null ? null : format(newValue),
      };
    }
  }
}

/** "Edited" for a direct edit; a cause the web app does not know reads as its words. */
export function causeLabel(kind: string): string {
  const known = KNOWN_CAUSES[kind];
  return known ? t(known) : sentenceCase(kind);
}

/** Who made a change, in words. */
export function authorName(author: HistoryLine["author"]): string {
  switch (author.kind) {
    case "SIGNED_IN_USER":
      return author.email ?? t("records.history.author.someone");
    case "BROCCOLI_ITSELF":
      return t("records.history.author.broccoli");
    case "SETUP_HOLDER":
      return t("records.history.author.setup");
    case "EXTERNAL_AGENT":
      return t("records.history.author.agent");
  }
}

const KNOWN_CAUSES: Partial<Record<string, MessageKey>> = {
  EDITED_DIRECTLY: "records.history.cause.edited",
  IMPORTED_FROM_FILE: "records.history.cause.import",
  ADDED_WITH_DEMO: "records.history.cause.demo",
};

/** The calendar day of `date` in `timeZone`, as `YYYY-MM-DD` (the en-CA format). */
function dayOf(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(date);
}

function dayParts(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year!, month! - 1, date!];
}

function dayLabel(day: string, today: string, yesterday: string): string {
  if (day === today) return t("records.history.today");
  if (day === yesterday) return t("records.history.yesterday");
  const [year, month, date] = dayParts(day);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: year === dayParts(today)[0] ? undefined : "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month, date));
}

/** "costCenter" or "APPLIED_SCHEDULED_CHANGE" as "Cost center" or "Applied scheduled change". */
function sentenceCase(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
