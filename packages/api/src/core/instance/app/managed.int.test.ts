import { expect, NON_OWNER, SYSTEM, test } from "#test/support";

import { runInTransaction, type Orm } from "../../db";
import { createEventBus } from "../../events";
import { createLogger } from "../../logger";
import { AssignmentConflictError, type ManagedAssignment } from "../domain";
import { assignInstance, readAssignment } from "./managed";

const ACME: ManagedAssignment = {
  companyId: "c-acme",
  publicOrigin: "https://acme.example.com",
  websiteOrigin: "https://www.example.com",
};

test("refuses a non-owner assigning an instance and leaves it unassigned", async ({ orm }) => {
  const eventBus = createEventBus(createLogger("silent"));

  await expect(
    runInTransaction(orm, eventBus, (tx) => assignInstance(NON_OWNER, tx, ACME)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });

  expect(await readAssignment(orm)).toBeNull();
});

test("stores the first assignment", async ({ orm }) => {
  await assign(orm, ACME);

  expect(await readAssignment(orm)).toEqual(ACME);
});

test("accepts the same assignment again", async ({ orm }) => {
  await assign(orm, ACME);

  await expect(assign(orm, { ...ACME })).resolves.toBeUndefined();
  expect(await readAssignment(orm)).toEqual(ACME);
});

test.for([
  ["company", { companyId: "c-other" }],
  ["public origin", { publicOrigin: "https://other.example.com" }],
  ["website origin", { websiteOrigin: "https://other.example.com" }],
] as const)("refuses a different %s", async ([, change], { orm }) => {
  await assign(orm, ACME);

  await expect(assign(orm, { ...ACME, ...change })).rejects.toBeInstanceOf(AssignmentConflictError);
  expect(await readAssignment(orm)).toEqual(ACME);
});

test("refuses an instance whose owner was claimed without an assignment", async ({ orm, seed }) => {
  await seed.owner();

  await expect(assign(orm, ACME)).rejects.toBeInstanceOf(AssignmentConflictError);
});

test("keeps one assignment when two arrive together", async ({ orm }) => {
  const results = await Promise.allSettled([
    assign(orm, ACME),
    assign(orm, { ...ACME, companyId: "c-other" }),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected?.reason).toBeInstanceOf(AssignmentConflictError);
  expect(["c-acme", "c-other"]).toContain((await readAssignment(orm))?.companyId);
});

function assign(orm: Orm, assignment: ManagedAssignment) {
  const eventBus = createEventBus(createLogger("silent"));
  return runInTransaction(orm, eventBus, (tx) => assignInstance(SYSTEM, tx, assignment));
}
