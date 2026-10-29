process.env.TZ = "America/Los_Angeles";

import { expect, it } from "vitest";

import { formatCalendarDate } from "@/lib/formatDate";

import { authorName, causeLabel, groupByDay, summaryOf } from "./historyLines";
import type { RecordDescription } from "../recordDescription";

it("groups consecutive lines by day without changing their order", () => {
  const newest = { ...line, id: "newest", occurredAt: "2026-10-23T18:00:00Z" };
  const earlier = { ...line, id: "earlier", occurredAt: "2026-10-23T10:00:00Z" };
  const yesterday = { ...line, id: "yesterday", occurredAt: "2026-10-22T12:00:00Z" };

  const groups = groupByDay([newest, earlier, yesterday], new Date("2026-10-23T20:00:00Z"), "UTC");

  expect(groups).toEqual([
    { label: "Today", lines: [newest, earlier] },
    { label: "Yesterday", lines: [yesterday] },
  ]);
});

it("uses the browser time zone when none is supplied", () => {
  const evening = { ...line, occurredAt: "2026-10-23T01:00:00Z" };

  const groups = groupByDay([evening], new Date("2026-10-23T12:00:00Z"));

  expect(groups).toEqual([{ label: "Yesterday", lines: [evening] }]);
});

it("uses calendar days across a daylight saving change in the requested zone", () => {
  const yesterday = { ...line, occurredAt: "2026-03-07T20:00:00Z" };

  const groups = groupByDay([yesterday], new Date("2026-03-09T06:30:00Z"), "America/Los_Angeles");

  expect(groups).toEqual([{ label: "Yesterday", lines: [yesterday] }]);
});

it("labels older days with a short month and a year only outside the current year", () => {
  const thisYear = { ...line, occurredAt: "2026-10-21T12:00:00Z" };
  const lastYear = { ...line, occurredAt: "2025-10-21T12:00:00Z" };

  const groups = groupByDay([thisYear, lastYear], new Date("2026-10-23T12:00:00Z"), "UTC");

  expect(groups).toEqual([
    { label: "21 Oct", lines: [thisYear] },
    { label: "21 Oct 2025", lines: [lastYear] },
  ]);
});

it("returns no day groups without history lines", () => {
  const groups = groupByDay([], new Date("2026-10-23T12:00:00Z"), "UTC");

  expect(groups).toEqual([]);
});

it("summarises one changed field with its label and stored text", () => {
  const summary = summaryOf(line, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Job title",
    oldValue: "Designer",
    newValue: "Lead designer",
  });
});

it("summarises one changed field with its stored labels instead of ids", () => {
  const change = {
    field: "manager",
    oldValue: "00000000-0000-4000-8000-000000000001",
    newValue: "00000000-0000-4000-8000-000000000002",
    oldLabel: "Robin Reed",
    newLabel: "Taylor Brook",
    oldHidden: false,
    newHidden: false,
  };

  const summary = summaryOf({ ...line, changes: [change] }, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Manager",
    oldValue: "Robin Reed",
    newValue: "Taylor Brook",
  });
});

it("shows Hidden for a hidden old reference while keeping the visible new label", () => {
  const change = {
    field: "manager",
    oldValue: null,
    oldLabel: null,
    oldHidden: true,
    newValue: "00000000-0000-4000-8000-000000000002",
    newLabel: "Taylor Brook",
    newHidden: false,
  };

  const summary = summaryOf({ ...line, changes: [change] }, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Manager",
    oldValue: "Hidden",
    newValue: "Taylor Brook",
  });
});

it("formats both values using the changed field's formatter", () => {
  const change = {
    field: "startDate",
    oldValue: "2025-01-06",
    newValue: "2025-02-07",
    oldLabel: null,
    newLabel: null,
    oldHidden: false,
    newHidden: false,
  };

  const summary = summaryOf({ ...line, changes: [change] }, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Start date",
    oldValue: "06/01/2025",
    newValue: "07/02/2025",
  });
});

it("keeps a missing old value null when a field is set", () => {
  const change = {
    field: "startDate",
    oldValue: null,
    newValue: "2025-01-06",
    oldLabel: null,
    newLabel: null,
    oldHidden: false,
    newHidden: false,
  };

  const summary = summaryOf({ ...line, changes: [change] }, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Start date",
    oldValue: null,
    newValue: "06/01/2025",
  });
});

it("keeps a missing new value null when a field is cleared", () => {
  const change = {
    field: "startDate",
    oldValue: "2025-01-06",
    newValue: null,
    oldLabel: null,
    newLabel: null,
    oldHidden: false,
    newHidden: false,
  };

  const summary = summaryOf({ ...line, changes: [change] }, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Start date",
    oldValue: "06/01/2025",
    newValue: null,
  });
});

it("labels an unknown field in sentence case and leaves its values unformatted", () => {
  const change = {
    field: "costCenter",
    oldValue: "001",
    newValue: "002",
    oldLabel: null,
    newLabel: null,
    oldHidden: false,
    newHidden: false,
  };

  const summary = summaryOf({ ...line, changes: [change] }, description);

  expect(summary).toEqual({
    kind: "changed",
    label: "Cost center",
    oldValue: "001",
    newValue: "002",
  });
});

it("summarises several changed fields with their labels in change order", () => {
  const changes = [
    {
      field: "jobTitle",
      oldValue: "Designer",
      newValue: "Lead designer",
      oldLabel: null,
      newLabel: null,
      oldHidden: false,
      newHidden: false,
    },
    {
      field: "costCenter",
      oldValue: null,
      newValue: "002",
      oldLabel: null,
      newLabel: null,
      oldHidden: false,
      newHidden: false,
    },
  ];

  const summary = summaryOf({ ...line, changes }, description);

  expect(summary).toEqual({ kind: "updatedMany", labels: ["Job title", "Cost center"] });
});

it("names a created record from its title field's new value", () => {
  const changes = [
    {
      field: "jobTitle",
      oldValue: null,
      newValue: "Designer",
      oldLabel: null,
      newLabel: null,
      oldHidden: false,
      newHidden: false,
    },
    {
      field: "firstName",
      oldValue: null,
      newValue: "Avery",
      oldLabel: null,
      newLabel: null,
      oldHidden: false,
      newHidden: false,
    },
  ];

  const summary = summaryOf({ ...line, operation: "CREATED", changes }, description);

  expect(summary).toEqual({
    kind: "created",
    title: "Avery",
    labels: ["Job title", "First name"],
  });
});

it("leaves a created record's title null when its title field is missing", () => {
  const summary = summaryOf({ ...line, operation: "CREATED" }, description);

  expect(summary).toEqual({ kind: "created", title: null, labels: ["Job title"] });
});

it("names a deleted record from its title field's old value", () => {
  const changes = [
    {
      field: "firstName",
      oldValue: "Avery",
      newValue: null,
      oldLabel: null,
      newLabel: null,
      oldHidden: false,
      newHidden: false,
    },
  ];

  const summary = summaryOf({ ...line, operation: "DELETED", changes }, description);

  expect(summary).toEqual({ kind: "deleted", title: "Avery" });
});

it("leaves a deleted record's title null when its title field is missing", () => {
  const summary = summaryOf({ ...line, operation: "DELETED" }, description);

  expect(summary).toEqual({ kind: "deleted", title: null });
});

it("labels a direct edit as Edited", () => {
  expect(causeLabel("EDITED_DIRECTLY")).toBe("Edited");
});

it("labels a file import as Import", () => {
  expect(causeLabel("ADDED_FROM_IMPORT")).toBe("Import");
});

it("labels demo data as Demo", () => {
  expect(causeLabel("ADDED_WITH_DEMO")).toBe("Demo");
});

it("labels an unknown cause in sentence case", () => {
  expect(causeLabel("APPLIED_SCHEDULED_CHANGE")).toBe("Applied scheduled change");
});

it("names a signed-in author by their email", () => {
  expect(authorName({ kind: "SIGNED_IN_USER", email: "avery@example.com" })).toBe(
    "avery@example.com",
  );
});

it("names a deleted user Someone", () => {
  expect(authorName({ kind: "SIGNED_IN_USER", email: null })).toBe("Someone");
});

it("names Broccoli's own changes Broccoli", () => {
  expect(authorName({ kind: "BROCCOLI_ITSELF", email: null })).toBe("Broccoli");
});

it("names the setup holder Setup", () => {
  expect(authorName({ kind: "SETUP_HOLDER", email: null })).toBe("Setup");
});

it("names an external agent Your agent", () => {
  expect(authorName({ kind: "EXTERNAL_AGENT", email: null })).toBe("Your agent");
});

const line: Parameters<typeof summaryOf>[0] = {
  id: "history-line",
  operation: "UPDATED",
  occurredAt: "2026-10-23T12:00:00Z",
  author: { kind: "SIGNED_IN_USER", email: "avery@example.com" },
  cause: { kind: "EDITED_DIRECTLY" },
  reason: null,
  changes: [
    {
      field: "jobTitle",
      oldValue: "Designer",
      newValue: "Lead designer",
      oldLabel: null,
      newLabel: null,
      oldHidden: false,
      newHidden: false,
    },
  ],
};

const description: RecordDescription = {
  titleField: "firstName",
  fields: [
    {
      key: "firstName",
      label: "First name",
      section: "Personal",
      editor: "text",
      format: (value) => value,
    },
    {
      key: "jobTitle",
      label: "Job title",
      section: "Job",
      editor: "text",
      format: (value) => value,
    },
    {
      key: "startDate",
      label: "Start date",
      section: "Job",
      editor: "date",
      format: (value) => formatCalendarDate(value) ?? value,
    },
  ],
};
