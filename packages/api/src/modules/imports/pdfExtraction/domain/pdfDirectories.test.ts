import { expect, it } from "vitest";
import { line, page } from "#test/support";
import { pdfDirectories } from "./pdfDirectories";

it("keeps the first row of headerless directories with several names on each line", () => {
  const candidates = pdfDirectories([
    page([
      line(700, ["AST", "Stone, Dr. Avery", "MU, SPO", "RRE", "Reed, Robin (LiV)", "HR"]),
      line(680, ["SLE", "Lee, Sam", "IT", "KPA", "Park, Kim", "HR"]),
    ]),
  ]);
  expect(candidates.find((c) => c.id === "parallelNames")?.sheets[0]?.rows).toEqual([
    ["Name"],
    ["Stone, Dr. Avery"],
    ["Reed, Robin"],
    ["Lee, Sam"],
    ["Park, Kim"],
  ]);
});

it("uses the role above each titled name in parallel columns", () => {
  const candidates = pdfDirectories([
    page([
      line(700, ["Director", "Office Manager"]),
      line(688, ["Dr Avery Stone, PhD", "Ms Robin Reed, MA"]),
      line(660, ["Engineer"]),
      line(648, ["Mr Sam Lee"]),
    ]),
  ]);
  expect(candidates.find((c) => c.id === "roleAbove")?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Dr Avery Stone", "Director"],
    ["Ms Robin Reed", "Office Manager"],
    ["Mr Sam Lee", "Engineer"],
  ]);
});

it("keeps names paired with birthdays in each column without inventing start dates", () => {
  const candidates = pdfDirectories([
    page([
      line(740, ["Employee birthdays"]),
      line(700, ["Avery Stone", "January 1", "Robin Reed", "July 10"]),
      line(680, ["Sam Lee - UNIT", "February 3"]),
    ]),
  ]);
  expect(candidates.find((c) => c.id === "birthdays")?.sheets[0]?.rows).toEqual([
    ["Name", "Birth date"],
    ["Avery Stone", "January 1"],
    ["Robin Reed", "July 10"],
    ["Sam Lee", "February 3"],
  ]);
});

it("does not generate directory people from a single comma phrase or month heading", () => {
  expect(
    pdfDirectories([page([line(700, ["Harbor, California"]), line(680, ["January"])])]),
  ).toEqual([]);
});

it("does not flatten a city and state grid into comma-separated people", () => {
  expect(
    pdfDirectories([
      page([
        line(740, ["City", "State"]),
        line(720, ["Portland, OR", "Madison, WI"]),
        line(700, ["Seattle, WA", "Denver, CO"]),
      ]),
    ]),
  ).toEqual([]);
});

it("keeps titled people whose role is absent between directory entries", () => {
  const candidates = pdfDirectories([
    page([
      line(700, ["Director"]),
      line(688, ["Dr Avery Stone"]),
      line(676, ["Ms Robin Reed"]),
      line(640, ["Engineer"]),
      line(628, ["Mr Sam Lee"]),
    ]),
  ]);
  expect(candidates.find((c) => c.id === "roleAbove")?.sheets[0]?.rows).toEqual([
    ["Name", "Job title"],
    ["Dr Avery Stone", "Director"],
    ["Ms Robin Reed", ""],
    ["Mr Sam Lee", "Engineer"],
  ]);
});
