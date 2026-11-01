import { expect, it } from "vitest";

import { addDays, parseCalendarDate } from "../../../utils";
import { demoPeople } from ".";

const today = parseCalendarDate("2026-10-13")!;

it("provides 40 demo people", () => {
  expect(demoPeople(today)).toHaveLength(40);
});

it("gives each demo person a unique key", () => {
  const people = demoPeople(today);

  expect(new Set(people.map(({ key }) => key)).size).toBe(people.length);
});

it("gives each demo person a unique email at example.com", () => {
  const emails = demoPeople(today).map(({ employee }) => employee.email);

  expect(new Set(emails).size).toBe(emails.length);
  for (const email of emails) {
    expect(email).toMatch(/^[^@]+@example\.com$/);
  }
});

it("has exactly two people starting after today", () => {
  const people = demoPeople(today);

  expect(
    people.filter(({ employee }) => employee.startDate && employee.startDate > today),
  ).toHaveLength(2);
});

it("moves every start date by one day when today moves by one day", () => {
  const people = demoPeople(today);

  const tomorrow = demoPeople(addDays(today, 1));

  expect(
    tomorrow.map(({ key, employee }) => ({ key, startDate: employee.startDate ?? null })),
  ).toEqual(
    people.map(({ key, employee }) => ({
      key,
      startDate: employee.startDate ? addDays(parseCalendarDate(employee.startDate)!, 1) : null,
    })),
  );
});

it("gives everyone but the CEO a manager among the demo people", () => {
  const employees = demoPeople(today).map(({ employee, managerEmail }) => ({
    ...employee,
    managerEmail,
  }));
  const ceo = employees.find(({ jobTitle }) => jobTitle === "CEO")!;
  const emails = new Set(employees.map(({ email }) => email));

  expect(ceo).toBeDefined();
  expect(ceo.managerEmail).toBeNull();
  expect(
    employees
      .filter(({ jobTitle }) => jobTitle !== "CEO")
      .every(
        ({ email, managerEmail }) =>
          managerEmail != null && managerEmail !== email && emails.has(managerEmail),
      ),
  ).toBe(true);
});
