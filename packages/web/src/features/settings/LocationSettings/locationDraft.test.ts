import { expect, it } from "vitest";

import { locationCreateInput, locationUpdateInput, saveLine, termsNote } from "./locationDraft";

it("updates only the terms when the trimmed name is unchanged", () => {
  expect(
    locationUpdateInput(saved, { name: " Glasgow ", termsId: "other-terms" }, "default-terms"),
  ).toEqual({ id: saved.id, termsId: "other-terms" });
});

it("updates only the name as typed when the terms are unchanged", () => {
  expect(
    locationUpdateInput(saved, { name: " Glasgow West ", termsId: "scotland" }, "default-terms"),
  ).toEqual({ id: saved.id, name: " Glasgow West " });
});

it("sends null when changing to the default terms", () => {
  expect(
    locationUpdateInput(saved, { name: "Glasgow", termsId: "default-terms" }, "default-terms"),
  ).toEqual({ id: saved.id, termsId: null });
});

it.for(["Glasgow", " Glasgow "])("has no update when name %s and terms are unchanged", (name) => {
  expect(locationUpdateInput(saved, { name, termsId: "scotland" }, "default-terms")).toBeNull();
});

it("leaves out the default terms when creating a location", () => {
  expect(
    locationCreateInput({ name: " Leeds ", termsId: "default-terms" }, "default-terms"),
  ).toEqual({ name: " Leeds " });
});

it("includes the chosen terms when creating a location", () => {
  expect(locationCreateInput({ name: "Glasgow", termsId: "scotland" }, "default-terms")).toEqual({
    name: "Glasgow",
    termsId: "scotland",
  });
});

it("describes adding a location and where its new people start", () => {
  expect(
    saveLine({
      saved: null,
      draft: { name: "Leeds", termsId: "default-terms" },
      termsName: "England and Wales",
    }),
  ).toBe("Saving adds Leeds. New people there start on England and Wales.");
});

it("describes changing only a location's terms without moving its people", () => {
  expect(
    saveLine({
      saved,
      draft: { name: " Glasgow ", termsId: "default-terms" },
      termsName: "England and Wales",
    }),
  ).toBe("Saving changes where new people in Glasgow start. Nobody moves today.");
});

it("describes renaming only a location", () => {
  expect(
    saveLine({
      saved,
      draft: { name: "Glasgow West", termsId: "scotland" },
      termsName: "Scotland",
    }),
  ).toBe("Saving renames Glasgow to Glasgow West.");
});

it("describes renaming a location and changing its terms without moving its people", () => {
  expect(
    saveLine({
      saved,
      draft: { name: "Glasgow West", termsId: "default-terms" },
      termsName: "England and Wales",
    }),
  ).toBe(
    "Saving renames Glasgow to Glasgow West and changes where its new people start. Nobody moves today.",
  );
});

it.for(["Glasgow", " Glasgow "])(
  "has no save line when name %s and terms are unchanged",
  (name) => {
    expect(
      saveLine({ saved, draft: { name, termsId: "scotland" }, termsName: "Scotland" }),
    ).toBeNull();
  },
);

it.for([
  {
    peopleCount: 0,
    expected: "Glasgow's new people will start on England and Wales instead of Scotland.",
  },
  {
    peopleCount: 1,
    expected:
      "Glasgow's new people will start on England and Wales instead of Scotland. The 1 person already in Glasgow stays on their terms.",
  },
  {
    peopleCount: 6,
    expected:
      "Glasgow's new people will start on England and Wales instead of Scotland. The 6 people already in Glasgow stay on their terms.",
  },
])(
  "explains a terms change with $peopleCount people already in the location",
  ({ peopleCount, expected }) => {
    expect(
      termsNote({
        name: "Glasgow",
        fromTerms: "Scotland",
        toTerms: "England and Wales",
        peopleCount,
      }),
    ).toBe(expected);
  },
);

const saved = { id: "glasgow", name: "Glasgow", termsId: "scotland" };
