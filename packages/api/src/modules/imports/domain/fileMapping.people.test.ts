import { expect, it } from "vitest";

import { hasPeople, type ColumnMapping } from "./fileMapping";

it("finds no people in a name column of department words without an email column", () => {
  const sheet = [
    ["Cost centre", "Headcount"],
    ["Engineering", "3"],
    ["Research", "1"],
    ["Commercial", "2"],
    ["Finance", "1"],
  ];

  expect(hasPeople(sheet, 0, { ...UNMAPPED, fullName: 0 })).toBe(false);
});

it("finds no people in a Metric column of summary labels without an email column", () => {
  const sheet = [
    ["Metric", "Value"],
    ["Active employees", "4"],
    ["Subtotal payroll groups", "4"],
  ];

  expect(hasPeople(sheet, 0, { ...UNMAPPED, fullName: 0 })).toBe(false);
});

it("keeps people with department words as names when an email column is mapped", () => {
  const sheet = [
    ["Cost centre", "Headcount", "Email"],
    ["Engineering", "3", "engineering@example.com"],
    ["Research", "1", "research@example.com"],
    ["Commercial", "2", "commercial@example.com"],
    ["Finance", "1", "finance@example.com"],
  ];

  expect(hasPeople(sheet, 0, { ...UNMAPPED, fullName: 0, email: 2 })).toBe(true);
});

it("finds people when a name column includes a real name among department words", () => {
  const sheet = [
    ["Cost centre", "Headcount"],
    ["Engineering", "3"],
    ["Priya Nair", "1"],
    ["Commercial", "2"],
    ["Finance", "1"],
  ];

  expect(hasPeople(sheet, 0, { ...UNMAPPED, fullName: 0 })).toBe(true);
});

it("finds no people when the header repeats among department words", () => {
  const sheet = [
    ["Cost centre", "Headcount"],
    ["Engineering", "3"],
    ["Cost centre", "Headcount"],
    ["Research", "1"],
    ["Commercial", "2"],
    ["Finance", "1"],
  ];

  expect(hasPeople(sheet, 0, { ...UNMAPPED, fullName: 0 })).toBe(false);
});

it("finds people when only an email column is mapped", () => {
  const sheet = [["Email"], ["priya@harbor.example"]];

  expect(hasPeople(sheet, 0, { ...UNMAPPED, email: 0 })).toBe(true);
});

const UNMAPPED: ColumnMapping = {
  fullName: null,
  firstName: null,
  lastName: null,
  email: null,
  jobTitle: null,
  startDate: null,
};
