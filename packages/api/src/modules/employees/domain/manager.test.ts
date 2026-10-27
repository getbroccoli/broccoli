import fc from "fast-check";
import { expect, it } from "vitest";

import { managerChangeRefusal } from "./manager";

it("refuses making a person their own manager", () => {
  expect(managerChangeRefusal("a", "a", [])).toBe("self");
});

it("refuses a manager who already reports to the person", () => {
  expect(managerChangeRefusal("a", "b", ["a"])).toBe("loop");
});

it("any accepted change keeps the reporting lines free of loops", () => {
  const person = fc.integer({ min: 0, max: 7 }).map((id) => `p${id}`);
  const initialManagers = fc.tuple(
    ...Array.from({ length: 8 }, (_, id) => fc.integer({ min: -1, max: id - 1 })),
  );
  const changes = fc.array(fc.tuple(person, person), { minLength: 1, maxLength: 40 });

  fc.assert(
    fc.property(initialManagers, changes, (initial, changes) => {
      const managers = new Map(
        initial.map((manager, id) => [`p${id}`, manager === -1 ? null : `p${manager}`]),
      );

      for (const [employee, manager] of changes) {
        const managersAbove = walkManagers(managers, manager).slice(1);
        if (managerChangeRefusal(employee, manager, managersAbove) === null) {
          managers.set(employee, manager);
        }

        for (const person of managers.keys()) {
          walkManagers(managers, person);
        }
      }
    }),
  );
});

function walkManagers(managers: ReadonlyMap<string, string | null>, person: string): string[] {
  const visited = new Set<string>();
  let current: string | null = person;
  while (current !== null) {
    expect(visited.has(current)).toBe(false);
    visited.add(current);
    current = managers.get(current) ?? null;
  }
  return [...visited];
}
