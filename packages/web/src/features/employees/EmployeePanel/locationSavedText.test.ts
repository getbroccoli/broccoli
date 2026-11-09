import { expect, it } from "vitest";

import { locationSavedText } from "./locationSavedText";

it("says the person's terms stay when their new location starts people on different terms", () => {
  const text = locationSavedText({
    firstName: "Sam",
    termsName: "England and Wales",
    locationName: "Glasgow",
    locationTermsName: "Scotland",
  });

  expect(text).toBe(
    "Location saved. Sam stays on England and Wales; Glasgow’s new people start on Scotland.",
  );
});

it("adds no message when the person's terms match the new location's terms", () => {
  const text = locationSavedText({
    firstName: "Sam",
    termsName: "Scotland",
    locationName: "Glasgow",
    locationTermsName: "Scotland",
  });

  expect(text).toBeNull();
});
