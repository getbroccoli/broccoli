import fc from "fast-check";

import { employeeUseCases, expect, OWNER, test } from "#test/support";

import { ApplicationError } from "../../../../core/applicationError";
import type { EmployeeUseCases } from ".";

test("accepted manager changes never form a loop", { timeout: 30_000 }, async ({ orm, seed }) => {
  const employees = employeeUseCases(orm);
  const personIndex = fc.integer({ min: 0, max: 5 });
  const changes = fc.array(fc.tuple(personIndex, personIndex), { minLength: 1, maxLength: 30 });

  await fc.assert(
    fc.asyncProperty(changes, async (managerChanges) => {
      const people = await Promise.all(Array.from({ length: 6 }, () => seed.employee()));

      for (const [employeeIndex, managerIndex] of managerChanges) {
        try {
          await employees.updateEmployee(OWNER, {
            id: people[employeeIndex]!.id,
            managerId: people[managerIndex]!.id,
          });
        } catch (error) {
          if (!(error instanceof ApplicationError)) {
            throw error;
          }
          expect(error).toMatchObject({
            code: "INVALID_INPUT",
            fieldErrors: [{ field: "managerId" }],
          });
          expect(["self", "loop"]).toContain(error.fieldErrors[0]!.code);
        }

        for (const person of people) {
          await expectNoManagerLoop(employees, person.id);
        }
      }
    }),
    { numRuns: 25 },
  );
});

async function expectNoManagerLoop(employees: EmployeeUseCases, employeeId: string) {
  const seen = new Set<string>();
  let id: string | undefined = employeeId;
  while (id !== undefined) {
    expect(seen.has(id)).toBe(false);
    seen.add(id);
    id = (await employees.readManagers(OWNER, [id])).get(id)?.id;
  }
}
