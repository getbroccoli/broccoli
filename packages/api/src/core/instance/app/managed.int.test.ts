import { expect, NON_OWNER, SYSTEM, test } from "#test/support";

import type { Transact } from "../../db";
import { AssignmentConflictError, type ManagedAssignment } from "../domain";
import { assignInstance } from "./managed";
import { readInstance } from "./instance";

const ACME: ManagedAssignment = {
  companyId: "c-acme",
  publicOrigin: "https://acme.example.com",
  websiteOrigin: "https://www.example.com",
};

test("refuses a non-owner assigning an instance and leaves it unassigned", async ({
  orm,
  transact,
}) => {
  await expect(transact((tx) => assignInstance(NON_OWNER, tx, ACME))).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect((await readInstance(orm)).assignment).toBeNull();
});

test("stores the first assignment", async ({ orm, transact }) => {
  await assign(transact, ACME);

  expect((await readInstance(orm)).assignment).toEqual(ACME);
});

test("accepts the same assignment again", async ({ orm, transact }) => {
  await assign(transact, ACME);

  await expect(assign(transact, { ...ACME })).resolves.toBeUndefined();
  expect((await readInstance(orm)).assignment).toEqual(ACME);
});

test.for([
  ["company", { companyId: "c-other" }],
  ["public origin", { publicOrigin: "https://other.example.com" }],
  ["website origin", { websiteOrigin: "https://other.example.com" }],
] as const)("refuses a different %s", async ([, change], { orm, transact }) => {
  await assign(transact, ACME);

  await expect(assign(transact, { ...ACME, ...change })).rejects.toBeInstanceOf(
    AssignmentConflictError,
  );
  expect((await readInstance(orm)).assignment).toEqual(ACME);
});

test("refuses an instance whose owner was claimed without an assignment", async ({
  seed,
  transact,
}) => {
  await seed.owner();

  await expect(assign(transact, ACME)).rejects.toBeInstanceOf(AssignmentConflictError);
});

test("keeps one assignment when two arrive together", async ({ orm, transact }) => {
  const results = await Promise.allSettled([
    assign(transact, ACME),
    assign(transact, { ...ACME, companyId: "c-other" }),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const rejected = results.find((result) => result.status === "rejected");
  expect(rejected?.reason).toBeInstanceOf(AssignmentConflictError);
  expect(["c-acme", "c-other"]).toContain((await readInstance(orm)).assignment?.companyId);
});

function assign(transact: Transact, assignment: ManagedAssignment) {
  return transact((tx) => assignInstance(SYSTEM, tx, assignment));
}
