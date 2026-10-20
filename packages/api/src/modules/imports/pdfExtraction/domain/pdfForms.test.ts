import { expect, it } from "vitest";

import { page } from "#test/support";

import { pdfForms } from "./pdfForms";

it("reconstructs labeled employee fields before emergency contacts", () => {
  const candidate = pdfForms([
    page([
      text(700, 40, "Employee Number: 12345"),
      text(700, 190, "REED, AVERY"),
      text(680, 80, "Job Title: Analyst"),
      text(660, 80, "E-mail: avery@example.test"),
      text(640, 480, "Hire Date: 2/3/2020"),
      text(620, 40, "Emergency Contacts"),
      text(600, 80, "Name: Morgan Reed"),
      text(580, 80, "Job Title: Personal Assistant"),
    ]),
  ]);

  expect(candidate).toMatchObject([
    {
      id: "personnel-forms",

      sheets: [
        {
          name: null,
          rows: [
            ["Employee number", "Last name", "First name", "Job title", "Email", "Hire date"],
            ["12345", "REED", "AVERY", "Analyst", "avery@example.test", "2/3/2020"],
          ],
        },
      ],
    },
  ]);
  expect(candidate?.[0]?.sheets[0]?.knownMapping).toMatchObject({
    lastName: 1,
    firstName: 2,
    jobTitle: 3,
    email: 4,
    startDate: 5,
  });
});

it("reconstructs repeated mailing labels using vertical gaps", () => {
  expect(
    pdfForms([
      page([
        text(740, 20, "AVERY REED"),
        text(731, 20, "123 Oak Street"),
        text(722, 20, "Denver, CO 80202"),
        text(680, 20, "MORGAN STONE"),
        text(671, 20, "456 Pine Avenue"),
        text(662, 20, "Boulder, CO 80301"),
      ]),
    ]),
  ).toMatchObject([
    {
      id: "mailing-labels",

      sheets: [
        {
          name: null,
          rows: [
            ["Name", "Mailing address"],
            ["AVERY REED", "123 Oak Street, Denver, CO 80202"],
            ["MORGAN STONE", "456 Pine Avenue, Boulder, CO 80301"],
          ],
        },
      ],
    },
  ]);
});

it("does not create a mailing-label candidate from one address block", () => {
  expect(pdfForms([page([text(740, 20, "AVERY REED"), text(731, 20, "123 Oak Street")])])).toEqual(
    [],
  );
});

it("does not confuse a phone directory with street addresses", () => {
  expect(
    pdfForms([
      page([
        text(740, 20, "AVERY REED"),
        text(731, 20, "Tel. 555-0123"),
        text(700, 20, "ROBIN STONE"),
        text(691, 20, "Tel. 555-0124"),
      ]),
    ]),
  ).toEqual([]);
});

it("keeps incomplete employee names without treating the next field label as a value", () => {
  const forms = pdfForms([
    page([
      text(700, 40, "Employee Number: 12345"),
      text(680, 40, "First Name: Avery"),
      text(660, 40, "Last Name:"),
      text(660, 190, "Job Title: Analyst"),
    ]),
  ]);
  expect(forms[0]?.sheets[0]?.rows[1]).toEqual(["12345", "", "Avery", "Analyst", "", ""]);
});

it.each([
  ["9/25/2021", "2020-02-03"],
  ["25/9/2021", "2020-03-02"],
  ["4/5/2021", "2/3/2020"],
])("reads a hire date using the same form's other date %s", (reviewDate, expected) => {
  const forms = pdfForms([
    page([
      text(700, 40, "Employee Number: 12345"),
      text(680, 40, "First Name: Avery"),
      text(660, 40, "Hire Date: 2/3/2020"),
      text(640, 40, `Review Date: ${reviewDate}`),
    ]),
  ]);

  expect(forms[0]?.sheets[0]?.rows[1]?.[5]).toBe(expected);
});

it("keeps an ambiguous hire date when the form has conflicting date orders", () => {
  const forms = pdfForms([
    page([
      text(700, 40, "Employee Number: 12345"),
      text(680, 40, "First Name: Avery"),
      text(660, 40, "Hire Date: 2/3/2020"),
      text(640, 40, "Review Date: 9/25/2021"),
      text(620, 40, "Birth Date: 25/9/1990"),
    ]),
  ]);

  expect(forms[0]?.sheets[0]?.rows[1]?.[5]).toBe("2/3/2020");
});

it("does not use a different employee's dates to interpret an ambiguous hire date", () => {
  const forms = pdfForms([
    page([
      text(700, 40, "Employee Number: 12345"),
      text(680, 40, "First Name: Avery"),
      text(660, 40, "Hire Date: 2/3/2020"),
      text(640, 40, "Employee Number: 67890"),
      text(620, 40, "First Name: Robin"),
      text(600, 40, "Review Date: 9/25/2021"),
    ]),
  ]);

  expect(forms[0]?.sheets[0]?.rows[1]?.[5]).toBe("2/3/2020");
});

function text(y: number, x: number, value: string) {
  return [{ text: value, x, y, width: value.length * 5, height: 8 }];
}
