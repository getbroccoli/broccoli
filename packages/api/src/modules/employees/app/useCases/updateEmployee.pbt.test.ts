import fc from "fast-check";

import { employeeUseCases, expect, OWNER, test } from "#test/support";

import { ApplicationError } from "../../../../core/applicationError";
import type { EmployeeUseCases } from ".";

// A property test states a rule that must hold for every input and lets fast-check hunt for an
// input that breaks it. On a failure it shrinks the input to the smallest one that still fails,
// such as [[1, 4], [4, 1]]: "1 now reports to 4, then 4 to 1".

test(
  "invariant: accepted manager changes never form a loop",
  { timeout: 30_000 },
  async ({ orm, seed }) => {
    const employees = employeeUseCases(orm);
    // One change, [person, new manager], as positions in the team; anyone may pick anyone,
    // themselves too. [2, 5]: person 2 now reports to person 5.
    const managerChange = fc.tuple(fc.nat(TEAM_SIZE - 1), fc.nat(TEAM_SIZE - 1));
    // A random story of changes, applied in order. [[2, 5], [5, 0], [0, 2]]: 2 reports to 5,
    // 5 to 0, then 0 tries to report to 2, which would close the loop 2 → 5 → 0 → 2.
    const managerChanges = fc.array(managerChange, { minLength: 1, maxLength: 30 });

    await fc.assert(
      fc.asyncProperty(managerChanges, async (changes) => {
        // A fresh team for every story, so no story starts from another's managers.
        const team = await Promise.all(Array.from({ length: TEAM_SIZE }, () => seed.employee()));

        for (const [person, manager] of changes) {
          await changeManagerOrAcceptRefusal(employees, team[person]!.id, team[manager]!.id);

          // The invariant, checked after every step: nobody's chain of managers comes back to
          // them. 2 → 5 → 0 ends, so it holds; 2 → 5 → 0 → 2 would break it.
          for (const member of team) {
            await expectNoManagerLoop(employees, member.id);
          }
        }
      }),
      // 25 stories of up to 30 changes keep a run to a few seconds.
      { numRuns: 25 },
    );
  },
);

/**
 * Changes the manager; a refusal is the rule at work, any other error fails. [3, 3] is refused
 * as "self", and [0, 2] after 2 → 5 → 0 as "loop".
 */
async function changeManagerOrAcceptRefusal(
  employees: EmployeeUseCases,
  employeeId: string,
  managerId: string,
) {
  try {
    await employees.updateEmployee(OWNER, { id: employeeId, managerId });
  } catch (error) {
    if (!(error instanceof ApplicationError)) {
      throw error;
    }
    expect(error).toMatchObject({ code: "INVALID_INPUT", fieldErrors: [{ field: "managerId" }] });
    expect(["self", "loop"]).toContain(error.fieldErrors[0]!.code);
  }
}

/**
 * Follows managers up from `employeeId`, such as 2 → 5 → 0, and fails when the chain reaches
 * anyone twice.
 */
async function expectNoManagerLoop(employees: EmployeeUseCases, employeeId: string) {
  const chain = new Set<string>();
  let current: string | undefined = employeeId;
  while (current !== undefined) {
    expect(chain.has(current)).toBe(false);
    chain.add(current);
    current = (await employees.readManagers(OWNER, [current])).get(current)?.id;
  }
}

/** Small enough for fast-check to find and shrink a loop quickly, big enough for long chains. */
const TEAM_SIZE = 6;
