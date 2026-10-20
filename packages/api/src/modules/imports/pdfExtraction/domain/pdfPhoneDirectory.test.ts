import { expect, it } from "vitest";
import { line, page } from "#test/support";
import { pdfPhoneDirectory } from "./pdfPhoneDirectory";

it("does not use headers or the previous person's name as roles in a compact phone table", () => {
  const candidate = pdfPhoneDirectory([
    page([
      line(712, ["Name", "Phone"]),
      line(700, ["Avery Stone", "555-0101"]),
      line(688, ["Robin Reed"]),
      line(676, ["Sam Lee", "555-0102"]),
    ]),
  ]);
  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "", "555-0101"],
    ["Robin Reed", "", ""],
    ["Sam Lee", "", "555-0102"],
  ]);
});

it("does not use a field label above a phone contact as their role", () => {
  const candidate = pdfPhoneDirectory([
    page([
      line(740, ["Vertretung:"]),
      line(720, ["Avery Stone"]),
      line(708, ["Tel.: 555-0101"]),
      line(660, ["Vertretung:"]),
      line(640, ["Robin Reed"]),
      line(628, ["Tel.: 555-0102"]),
    ]),
  ]);
  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "", "Tel.: 555-0101"],
    ["Robin Reed", "", "Tel.: 555-0102"],
  ]);
});

it("uses telephone anchors to read a name column including staff without a phone", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(700, ["Director", "Avery Stone"]),
        line(660, ["Office", "Robin Reed", "555-0123"]),
        line(620, ["Engineer", "Sam Lee", "555-0124"]),
      ]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "Director", ""],
    ["Robin Reed", "", "555-0123"],
    ["Sam Lee", "Engineer", "555-0124"],
  ]);
});

it("associates telephone lines below names without making records for the labels", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(700, ["Director", "Avery Stone"]),
        line(688, ["of Operations", "Tel. 555-0123"]),
        line(650, ["Engineer", "Robin Reed"]),
        line(638, ["", "Tel. 555-0124"]),
      ]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "Director of Operations", "Tel. 555-0123"],
    ["Robin Reed", "Engineer", "Tel. 555-0124"],
  ]);
});

it("does not turn labeled addresses and telephone numbers into people", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(700, ["Address: 10 Oak Street"]),
        line(688, ["Tel. 555-0123"]),
        line(650, ["Address: 20 Pine Street"]),
        line(638, ["Tel. 555-0124"]),
      ]),
    ]),
  ).toBeNull();
});

it("does not turn office labels with telephone numbers into people", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(740, ["Office", "Telephone"]),
        line(720, ["Admissions Office", "555-0101"]),
        line(700, ["Records Office", "555-0102"]),
        line(680, ["Facilities Office", "555-0103"]),
      ]),
    ]),
  ).toBeNull();
});

it("keeps names on continuation pages where telephone cells are blank", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(700, ["Director", "Avery Stone", "555-0123"]),
        line(660, ["Engineer", "Robin Reed", "555-0124"]),
      ]),
      page([line(700, ["Analyst", "Sam Lee"]), line(660, ["Designer", "Kim Park"])]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "Director", "555-0123"],
    ["Robin Reed", "Engineer", "555-0124"],
    ["Sam Lee", "Analyst", ""],
    ["Kim Park", "Designer", ""],
  ]);
});

it("joins a hyphenated name and finds phone anchors with room details", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(700, ["Director", "Anja Berg-"]),
        line(688, ["", "mann"]),
        line(676, ["", "Tel.: 555-0123 | Room: 210"]),
        line(640, ["Engineer", "Ben North"]),
        line(628, ["", "Tel.: 555-0124 | Room: 211"]),
      ]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Job title", "Phone"],
    ["Anja Berg-mann", "Director", "Tel.: 555-0123 | Room: 210"],
    ["Ben North", "Engineer", "Tel.: 555-0124 | Room: 211"],
  ]);
});

it("keeps a job title wrapped beneath the person's row", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(700, ["Director of Public Services", "Avery Stone"]),
        line(688, ["and Community Affairs", "Tel.: 555-0123"]),
        line(640, ["Engineer", "Robin Reed", "555-0124"]),
      ]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "Director of Public Services and Community Affairs", "Tel.: 555-0123"],
    ["Robin Reed", "Engineer", "555-0124"],
  ]);
});

it("associates a centered role above two names with both people", () => {
  expect(
    pdfPhoneDirectory([
      page([
        line(714, ["Director"], 0, 80),
        line(700, ["Avery Stone", "Riley Hart"]),
        line(688, ["Tel. 555-0123", "Tel. 555-0124"]),
        line(650, ["Engineer"]),
        line(638, ["Sam Lee"]),
        line(626, ["Tel. 555-0125"]),
      ]),
    ])?.sheets[0]?.rows,
  ).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "Director", "Tel. 555-0123"],
    ["Riley Hart", "Director", "Tel. 555-0124"],
    ["Sam Lee", "Engineer", "Tel. 555-0125"],
  ]);
});

it("keeps each phone attached to its position when people share a name", () => {
  const candidate = pdfPhoneDirectory([
    page([
      line(700, ["Avery Stone", "Avery Stone"]),
      line(688, ["Tel. 555-0101", "Tel. 555-0102"]),
      line(650, ["Avery Stone"]),
      line(638, ["Tel. 555-0103"]),
    ]),
  ]);

  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Job title", "Phone"],
    ["Avery Stone", "", "Tel. 555-0101"],
    ["Avery Stone", "", "Tel. 555-0102"],
    ["Avery Stone", "", "Tel. 555-0103"],
  ]);
});
