import { expect, it } from "vitest";

import { wordHint } from "./wordHint";

it.each([
  ["avery@example.com", "email"],
  ["03.02.2021", "date_dmy_year4"],
  ["02/13/21", "date_mdy_year2"],
  ["42", "number"],
  ["Dr", "honorific"],
  ["PhD", "qualification"],
  ["Vorname", "given_name_heading"],
  ["Engineer", "role_word"],
])("gives %j the fixed category %s", (value, expected) => {
  expect(wordHint(value)).toBe(expected);
});
