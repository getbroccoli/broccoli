import { expect, it } from "vitest";

import { withPlaceholders } from "./placeholders";

it("keeps an email domain shared by three addresses", () => {
  expect(
    withPlaceholders({
      emails: ["lena@acme-corp.example", "tomas@acme-corp.example", "avery@acme-corp.example"],
    }),
  ).toEqual({
    emails: ["person1@acme-corp.example", "person2@acme-corp.example", "person3@acme-corp.example"],
  });
});

it("replaces a private email domain used fewer than three times", () => {
  expect(withPlaceholders({ emails: ["lena@mail.example", "tomas@mail.example"] })).toEqual({
    emails: ["person1@example.com", "person2@example.com"],
  });
});

it("keeps a public email provider's domain", () => {
  expect(withPlaceholders({ email: "lena@gmail.com" })).toEqual({ email: "person1@gmail.com" });
});

it("gives equal emails the same placeholder", () => {
  expect(withPlaceholders({ emails: ["lena@mail.example", "lena@mail.example"] })).toEqual({
    emails: ["person1@example.com", "person1@example.com"],
  });
});

it("numbers distinct emails in depth-first order of appearance", () => {
  expect(
    withPlaceholders({
      rows: { "1": ["tomas@one.example", { email: "lena@two.example" }] },
      email: "avery@three.example",
    }),
  ).toEqual({
    rows: { "1": ["person1@example.com", { email: "person2@example.com" }] },
    email: "person3@example.com",
  });
});

it("starts email numbering afresh for each request", () => {
  withPlaceholders({ email: "tomas@mail.example" });

  expect(withPlaceholders({ email: "lena@mail.example" })).toEqual({
    email: "person1@example.com",
  });
});

it("keeps only the year of an ISO date", () => {
  expect(withPlaceholders({ date: "1988-07-14" })).toEqual({ date: "1988-dd-dd" });
});

it("keeps only the year of a dotted date", () => {
  expect(withPlaceholders({ date: "14.07.1988" })).toEqual({ date: "dd.dd.1988" });
});

it("keeps only the year of a slashed date", () => {
  expect(withPlaceholders({ date: "01/03/2024" })).toEqual({ date: "dd/dd/2024" });
});

it("keeps heading words", () => {
  expect(
    withPlaceholders({ headings: ["Work email", "Start date", "Eintrittsdatum", "Vorname"] }),
  ).toEqual({ headings: ["Work email", "Start date", "Eintrittsdatum", "Vorname"] });
});

it("keeps job-title words", () => {
  expect(withPlaceholders({ roles: ["Office Administrator", "Maintenance Technician"] })).toEqual({
    roles: ["Office Administrator", "Maintenance Technician"],
  });
});

it("masks job words that are also common surnames", () => {
  expect(withPlaceholders({ name: "Mason Cook" })).toEqual({ name: "Xxxxx Xxxx" });
});

it("recognises heading words regardless of case and surrounding punctuation", () => {
  expect(withPlaceholders({ header: "(WORK) EMAIL:" })).toEqual({ header: "(WORK) EMAIL:" });
});

it("replaces a name with its letter shapes", () => {
  expect(withPlaceholders({ name: "Lena Vogel" })).toEqual({ name: "Xxxx Xxxxx" });
});

it("keeps the comma in a surname-first name", () => {
  expect(withPlaceholders({ name: "Vogel, Lena" })).toEqual({ name: "Xxxxx, Xxxx" });
});

it("keeps the apostrophe in a name", () => {
  expect(withPlaceholders({ name: "O'Brien" })).toEqual({ name: "X'Xxxxx" });
});

it("masks letters without case in a non-Latin name", () => {
  expect(withPlaceholders({ name: "山田" })).toEqual({ name: "xx" });
});

it("replaces phone digits while preserving punctuation and spacing", () => {
  expect(withPlaceholders({ phone: "+49 151 2345678" })).toEqual({ phone: "+dd ddd ddddddd" });
});

it("keeps heading words inside a mixed header", () => {
  expect(withPlaceholders({ header: "Lena's start date" })).toEqual({
    header: "Xxxx'x start date",
  });
});

it("keeps whitespace between masked tokens", () => {
  expect(withPlaceholders({ name: " Lena\t  Vogel\n" })).toEqual({ name: " Xxxx\t  Xxxxx\n" });
});

it("keeps an exact value found three times across the state", () => {
  expect(
    withPlaceholders({ role: "Gardening", rows: { "1": ["Gardening", { role: "Gardening" }] } }),
  ).toEqual({ role: "Gardening", rows: { "1": ["Gardening", { role: "Gardening" }] } });
});

it("masks a value found only twice", () => {
  expect(withPlaceholders({ roles: ["Gardening", "Gardening"] })).toEqual({
    roles: ["Xxxxxxxxx", "Xxxxxxxxx"],
  });
});

it("counts repeated values by exact equality", () => {
  expect(withPlaceholders({ roles: ["Gardening", "Gardening", "gardening"] })).toEqual({
    roles: ["Xxxxxxxxx", "Xxxxxxxxx", "xxxxxxxxx"],
  });
});

it("keeps blank strings", () => {
  expect(withPlaceholders({ blanks: ["", " ", "\t\n"] })).toEqual({ blanks: ["", " ", "\t\n"] });
});

it("keeps boolean words", () => {
  expect(
    withPlaceholders({
      flags: ["yes", "no", "true", "false", "y", "n", "x", "ja", "nein", "oui", "non", "sí"],
    }),
  ).toEqual({
    flags: ["yes", "no", "true", "false", "y", "n", "x", "ja", "nein", "oui", "non", "sí"],
  });
});

it("rewrites nested row arrays without changing their keys", () => {
  expect(withPlaceholders({ rows: { "1": ["Lena Vogel", "lena@mail.example"] } })).toEqual({
    rows: { "1": ["Xxxx Xxxxx", "person1@example.com"] },
  });
});

it("rewrites column headers and samples without changing their keys", () => {
  expect(
    withPlaceholders({ columns: { A: { header: "Lena's start date", samples: ["1988-07-14"] } } }),
  ).toEqual({ columns: { A: { header: "Xxxx'x start date", samples: ["1988-dd-dd"] } } });
});

it("leaves numbers, booleans and null unchanged", () => {
  expect(withPlaceholders({ values: [42, true, false, null] })).toEqual({
    values: [42, true, false, null],
  });
});

it("leaves the original state unchanged", () => {
  const state = { rows: { "1": ["Lena Vogel", "lena@mail.example"] } };

  withPlaceholders(state);

  expect(state).toEqual({ rows: { "1": ["Lena Vogel", "lena@mail.example"] } });
});
