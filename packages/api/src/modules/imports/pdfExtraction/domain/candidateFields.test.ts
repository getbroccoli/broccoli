import { expect, it } from "vitest";

import { columnFields, contextHint } from "./candidateFields";
import { knownColumnMapping } from "./layoutSheet";

it("uses only the builder's mapped columns when the headers disagree", () => {
  const sheet = {
    name: null,
    rows: [["Employee", "Name", "Email"]],
    knownMapping: knownColumnMapping({ firstName: 1, email: 0 }),
  };

  expect(columnFields(sheet)).toEqual(
    new Map([
      [1, "firstName"],
      [0, "email"],
    ]),
  );
});

it.each(["Employee", "Name"])(
  "keeps explicit given and family columns instead of the generic %s column",
  (header) => {
    expect(columnFields({ name: null, rows: [[header, "Given name", "Family name"]] })).toEqual(
      new Map([
        [0, "other"],
        [1, "firstName"],
        [2, "lastName"],
      ]),
    );
  },
);

it.each(["Employee ID", "#", "Personalnummer"])("does not treat %s as a name", (header) => {
  expect(columnFields({ name: null, rows: [[header]] }).get(0)).toBe("other");
});

it.each(["Hire date", "Eintritt"])("recognizes %s as a start date", (header) => {
  expect(columnFields({ name: null, rows: [[header]] }).get(0)).toBe("startDate");
});

it.each(["Date of birth", "Geburtsdatum"])("does not treat %s as a start date", (header) => {
  expect(columnFields({ name: null, rows: [[header]] }).get(0)).toBe("other");
});

it.each(["Role", "Hire date"])("infers a blank name header beside email and %s", (header) => {
  const sheet = {
    name: null,
    rows: [
      ["", "Email", header],
      ["Avery Stone", "avery@example.com", ""],
      ["Robin Reed", "robin@example.com", ""],
    ],
  };

  expect(columnFields(sheet).get(0)).toBe("fullName");
});

it.for([
  ["", "Email"],
  ["", "Role"],
  ["", "", "Email", "Role"],
])("leaves a blank header unresolved without one supported name column: %j", (headers) => {
  const sheet = { name: null, rows: [headers, ["Avery Stone"]] };

  expect(columnFields(sheet).get(0)).toBe("other");
});

it.each(["12345", "Emergency contact"])("does not infer a name column over %s", (value) => {
  const sheet = {
    name: null,
    rows: [
      ["", "Email", "Role"],
      [value, "avery@example.com", "Engineer"],
    ],
  };

  expect(columnFields(sheet).get(0)).toBe("other");
});

it.each(["Emergency contact", "Next of kin"])(
  "marks %s as an excluded contact heading",
  (value) => {
    expect(contextHint(value)).toBe("excluded_contact_heading");
  },
);

it("recognizes an employee section heading", () => {
  expect(contextHint("Employee information")).toBe("employee_section_heading");
});

it("leaves a person's name without a section hint", () => {
  expect(contextHint("Avery Stone")).toBeNull();
});
