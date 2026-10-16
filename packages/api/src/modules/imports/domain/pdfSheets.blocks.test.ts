import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfSheets } from ".";

it("reads labelled blocks in page order and drops the title", () => {
  expect(
    pdfSheets([
      page([
        line(760, ["Personaldaten – Nordlicht GmbH"]),
        line(690, ["Name: Müller, Anna"]),
        line(670, ["Tätigkeit: Sachbearbeiterin"]),
      ]),
      page([line(690, ["Name: Krause, Benedikt"]), line(670, ["Tätigkeit: Lagerleiter"])]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Tätigkeit"],
        ["Müller, Anna", "Sachbearbeiterin"],
        ["Krause, Benedikt", "Lagerleiter"],
      ],
    },
  ]);
});

it("puts unlabelled names in the first column with an empty header", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Avery Stone"]),
        line(680, ["Job title: Designer"]),
        line(660, ["Work email: avery@example.com"]),
        line(600, ["Robin Reed"]),
        line(580, ["Job title: Engineer"]),
        line(560, ["Work email: robin@example.com"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["", "Job title", "Work email"],
        ["Avery Stone", "Designer", "avery@example.com"],
        ["Robin Reed", "Engineer", "robin@example.com"],
      ],
    },
  ]);
});

it("keeps identical labelled values at the same place in every page's top band", () => {
  expect(
    pdfSheets([
      page([line(760, ["Avery Stone"]), line(740, ["Job title: Site Coordinator"])]),
      page([line(760, ["Robin Reed"]), line(740, ["Job title: Site Coordinator"])]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["", "Job title"],
        ["Avery Stone", "Site Coordinator"],
        ["Robin Reed", "Site Coordinator"],
      ],
    },
  ]);
});

it("leaves missing labels empty and orders columns by their first appearance", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Job title: Designer"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Work email: robin@example.com"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Job title", "Work email"],
        ["Avery Stone", "Designer", ""],
        ["Robin Reed", "", "robin@example.com"],
      ],
    },
  ]);
});

it("reads a label and value in separate cells as one labelled line", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name:", "Müller, Anna"]),
        line(680, ["Tätigkeit: Sachbearbeiterin"]),
        line(600, ["Name:", "Krause, Benedikt"]),
        line(580, ["Tätigkeit: Lagerleiter"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Tätigkeit"],
        ["Müller, Anna", "Sachbearbeiterin"],
        ["Krause, Benedikt", "Lagerleiter"],
      ],
    },
  ]);
});

it("drops an unlabelled page-number footer below the blocks", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Job title: Designer"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Job title: Engineer"]),
        line(30, ["Seite 1 von 3"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Job title"],
        ["Avery Stone", "Designer"],
        ["Robin Reed", "Engineer"],
      ],
    },
  ]);
});

it("reads one person's labelled details without any repeating label", () => {
  expect(
    pdfSheets([
      page([
        line(760, ["Personaldaten – Nordlicht GmbH"]),
        line(690, ["Name: Müller, Anna"]),
        line(670, ["Personalnummer: 61021"]),
        line(650, ["Tätigkeit: Sachbearbeiterin"]),
        line(630, ["Eintritt: 12.03.2021"]),
      ]),
    ]),
  ).toEqual([
    {
      name: null,
      rows: [
        ["Name", "Personalnummer", "Tätigkeit", "Eintritt"],
        ["Müller, Anna", "61021", "Sachbearbeiterin", "12.03.2021"],
      ],
    },
  ]);
});

it("refuses two labelled lines without a repeating label or table", () => {
  expect(
    pdfSheets([page([line(700, ["Name: Avery Stone"]), line(680, ["Job title: Designer"])])]),
  ).toBeNull();
});

it("refuses an unlabelled heading between blocks outside the page bands", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Job title: Designer"]),
        line(640, ["Two-column org view"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Job title: Engineer"]),
      ]),
    ]),
  ).toBeNull();
});

it("refuses side-by-side blocks instead of returning a partial list", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Job title: Designer"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Work email: a@x.example", "Work email: b@x.example"]),
      ]),
    ]),
  ).toBeNull();
});

it("refuses a label repeated within one block", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Email: avery@example.com"]),
        line(660, ["Email: other@example.com"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Email: robin@example.com"]),
      ]),
    ]),
  ).toBeNull();
});

it("refuses prose containing a time instead of treating it as a label", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name: Avery Stone"]),
        line(680, ["Job title: Designer"]),
        line(640, ["Meeting at 10:30 today"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Job title: Engineer"]),
      ]),
    ]),
  ).toBeNull();
});

it("refuses blocks after a table instead of falling back to a block list", () => {
  expect(
    pdfSheets([
      page([
        line(700, ["Name", "Email"]),
        line(680, ["Avery Stone", "avery@example.com"]),
        line(600, ["Name: Robin Reed"]),
        line(580, ["Work email: robin.reed@example.com"]),
        line(500, ["Name: Morgan Lake"]),
        line(480, ["Work email: morgan.lake@example.com"]),
      ]),
    ]),
  ).toBeNull();
});
