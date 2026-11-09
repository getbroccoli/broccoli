import { expect, it } from "vitest";

import { deleteReason, takenNameError } from "./termsNameText";

it("explains why the default terms cannot be deleted", () => {
  expect(deleteReason("DEFAULT_TERMS", [])).toBe(
    "The default terms stay, because people without a location start on them.",
  );
});

it("explains why terms people were on cannot be deleted", () => {
  expect(deleteReason("TERMS_HAD_PEOPLE", [])).toBe(
    "Terms people were on stay, so their history stays true.",
  );
});

it("names the location that starts people on terms", () => {
  expect(deleteReason("LOCATION_STARTS_PEOPLE_ON_TERMS", ["Glasgow"])).toBe(
    "Glasgow starts new people here. Choose other terms for it in Settings › Locations first.",
  );
});

it("names both locations that start people on terms", () => {
  expect(deleteReason("LOCATION_STARTS_PEOPLE_ON_TERMS", ["Glasgow", "Leeds"])).toBe(
    "Glasgow and Leeds start new people here. Choose other terms for them in Settings › Locations first.",
  );
});

it("names the existing terms ignoring case and surrounding spaces", () => {
  expect(takenNameError(" scotland ", ["England and Wales", "Scotland"])).toBe(
    "There are already terms called Scotland.",
  );
});

it("explains a taken name when no matching terms are known", () => {
  expect(takenNameError("Scotland", ["England and Wales"])).toBe(
    "There are already terms with this name.",
  );
});
