import { expect, it } from "vitest";

import { flattenProfiles, type Grant } from ".";

it("adds the parents' and grandparents' grants and operations to a child's own", () => {
  const read: Grant = { key: "read", object: "employee", actions: ["read"], scope: "all" };
  const update: Grant = {
    key: "update",
    object: "employee",
    actions: ["update"],
    scope: "self",
    fields: ["firstName"],
  };
  const create: Grant = {
    key: "create",
    object: "employee",
    actions: ["create"],
    scope: "all",
    fields: "*",
  };

  const profiles = flattenProfiles({
    ROOT: { builtIn: true, grants: [read], operations: ["MANAGE_WORKSPACE"] },
    PARENT: { builtIn: true, extends: ["ROOT"], grants: [update], operations: [] },
    CHILD: {
      builtIn: false,
      extends: ["PARENT"],
      grants: [create],
      operations: ["RESET_WORKSPACE"],
    },
  });

  expect(profiles.CHILD.grants).toHaveLength(3);
  expect(profiles.CHILD.grants).toEqual(expect.arrayContaining([read, update, create]));
  expect(profiles.CHILD.operations).toEqual(new Set(["MANAGE_WORKSPACE", "RESET_WORKSPACE"]));
});

it("adds a shared ancestor's grant only once in a diamond", () => {
  const read: Grant = { key: "read", object: "employee", actions: ["read"], scope: "all" };

  const profiles = flattenProfiles({
    ROOT: { builtIn: true, grants: [read], operations: ["MANAGE_WORKSPACE"] },
    LEFT: { builtIn: true, extends: ["ROOT"], grants: [], operations: [] },
    RIGHT: { builtIn: true, extends: ["ROOT"], grants: [], operations: [] },
    CHILD: { builtIn: false, extends: ["LEFT", "RIGHT"], grants: [], operations: [] },
  });

  expect(profiles.CHILD.grants).toEqual([read]);
  expect(profiles.CHILD.operations).toEqual(new Set(["MANAGE_WORKSPACE"]));
});

it("refuses profiles that extend each other in a cycle", () => {
  expect(() =>
    flattenProfiles({
      A: { builtIn: false, extends: ["B"], grants: [], operations: [] },
      B: { builtIn: false, extends: ["A"], grants: [], operations: [] },
    }),
  ).toThrow("Permission profiles extend each other in a cycle: A → B → A.");
});

it("refuses a profile that extends an unknown parent", () => {
  expect(() =>
    flattenProfiles({
      A: { builtIn: false, extends: ["X"], grants: [], operations: [] },
    }),
  ).toThrow('Permission profile "A" extends unknown "X".');
});
