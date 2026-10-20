import { expect, it } from "vitest";
import { line, page } from "#test/support";
import { pdfContactBlocks } from "./pdfContactBlocks";

it("reads named telephone contacts within role descriptions across pages", () => {
  const candidate = pdfContactBlocks([
    page([
      line(740, ["Department"]),
      line(700, ["Leitung:", "Avery Stone", "ABC", "Tel.: 4410"]),
      line(680, ["Aufgaben"]),
      line(660, ["Leitung des Ministerbüros"]),
      line(640, ["Planning and coordinating the department's work"]),
      line(580, ["Pressesprecher"]),
      line(560, ["Planning and coordinating the communication strategy"]),
      line(540, ["Robin Reed Tel.: 4419"]),
    ]),
    page([
      line(700, ["Leitung:", "Sam Lee", "DEF", "Tel.: 4411"]),
      line(680, ["Aufgaben"]),
      line(660, ["Leitung der Stabsstelle Koordinierung"]),
    ]),
  ]);
  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Avery Stone", "Leitung des Ministerbüros"],
    ["Robin Reed", "Pressesprecher"],
    ["Sam Lee", "Leitung der Stabsstelle Koordinierung"],
  ]);
});

it("ignores office telephone labels and prose without an individual name", () => {
  expect(
    pdfContactBlocks([
      page([
        line(740, ["Director"]),
        line(720, ["Admissions Office Tel.: 4409"]),
        line(700, ["Central office Tel.: 4410"]),
        line(680, ["Department:", "Tel.: 4411"]),
      ]),
    ]),
  ).toBeNull();
});

it("does not carry a preceding contact's role into a later section", () => {
  const candidate = pdfContactBlocks([
    page([
      line(740, ["Director"]),
      line(720, ["Avery Stone Tel.: 4410"]),
      line(500, ["Accounting section"]),
      line(480, ["Robin Reed Tel.: 4411"]),
    ]),
  ]);
  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Avery Stone", "Director"],
    ["Robin Reed", ""],
  ]);
});

it("does not borrow the next labeled contact's expanded role", () => {
  const candidate = pdfContactBlocks([
    page([
      line(700, ["Head:", "Avery Stone", "Tel.: 4410"]),
      line(680, ["Head:", "Robin Reed", "Tel.: 4411"]),
      line(660, ["Head of Accounting"]),
    ]),
  ]);
  expect(candidate?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Avery Stone", "Head"],
    ["Robin Reed", "Head of Accounting"],
  ]);
});
