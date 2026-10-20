import { expect, it } from "vitest";

import { line, page } from "#test/support";

import { pdfNumberedPeople } from "./pdfNumberedPeople";

it("splits reliable comma-form surnames and given names when one given name is blank", () => {
  const result = pdfNumberedPeople([
    page([
      line(740, ["P-NR NAME"]),
      line(700, ["1 Stone, Avery"]),
      line(660, ["2 Reed,"]),
      line(620, ["3 van der Meer, Robin"]),
    ]),
  ]);

  expect(result?.sheets[0]?.rows).toEqual([
    ["Staff number", "Last name", "First name"],
    ["1", "Stone", "Avery"],
    ["2", "Reed", ""],
    ["3", "van der Meer", "Robin"],
  ]);
});

it("leaves name cells with extra comma parts intact", () => {
  const result = pdfNumberedPeople([
    page([
      line(740, ["P-NR NAME"]),
      line(700, ["1 Stone, Avery, Jr."]),
      line(660, ["2 Reed, Robin"]),
    ]),
  ]);
  expect(result?.sheets[0]?.rows).toEqual([
    ["Staff number", "Name", "Start date"],
    ["1", "Stone, Avery, Jr.", ""],
    ["2", "Reed, Robin", ""],
  ]);
});

it("reads stacked payroll names at staff numbers without importing numeric detail rows", () => {
  const result = pdfNumberedPeople([
    page([
      line(740, ["P-NR NAME", "G-BRUTTO", "LFD-BEZ"]),
      line(700, ["10 Stone", "2000,00", "1900,00"]),
      line(688, ["Avery", "50,00", "40,00"]),
      line(676, ["4 2,0 1", "30", "20"]),
      line(650, ["20 Reed", "3000,00", "2900,00"]),
      line(638, ["Robin", "70,00", "60,00"]),
      line(626, ["3 1,0 1", "30", "20"]),
      line(600, ["Gesamt-Summen", "5000,00"]),
    ]),
  ]);
  expect(result?.sheets[0]?.rows).toEqual([
    ["Staff number", "Last name", "First name"],
    ["10", "Stone", "Avery"],
    ["20", "Reed", "Robin"],
  ]);
});

it("keeps a dated name row separate from holiday balance continuation lines", () => {
  const result = pdfNumberedPeople([
    page([
      line(740, ["P-NR NAME, VORNAME", "EINTRITT", "TAGE"]),
      line(700, ["1 Stone, Avery", "1.10.20 VJ:", "4,00"]),
      line(688, ["", "LJ: 30,00", "19,00"]),
      line(660, ["3 Reed, Robin", "15.11.21 LJ: 30,00", "10,00"]),
    ]),
  ]);
  expect(result?.sheets[0]?.rows).toEqual([
    ["Staff number", "Last name", "First name", "Start date"],
    ["1", "Stone", "Avery", "1.10.20"],
    ["3", "Reed", "Robin", "15.11.21"],
  ]);
});

it("does not treat numbered prose or a payroll with a missing stacked name as complete", () => {
  expect(
    pdfNumberedPeople([page([line(700, ["1 Open the account"]), line(680, ["2 Send a letter"])])]),
  ).toBeNull();
  expect(
    pdfNumberedPeople([
      page([
        line(740, ["P-NR NAME", "G-BRUTTO"]),
        line(700, ["1 Stone", "2000,00"]),
        line(688, ["Avery", "100,00"]),
        line(650, ["2 Reed", "3000,00"]),
        line(638, ["3 0,0 1", "100,00"]),
      ]),
    ]),
  ).toBeNull();
});
