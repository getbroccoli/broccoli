import {
  expect,
  MANAGED_INSTANCE_CREDENTIAL,
  EMPLOYEE,
  SYSTEM,
  test,
  TEST_SECRET_BOX,
} from "#test/support";

import type { Transact } from "../../db";
import { AssignmentConflictError, type ManagedAssignment } from "../domain";
import { instanceRepository } from "../db";
import { assignInstance } from "./managed";
import { readInstance } from "./instance";

const ACME: ManagedAssignment = {
  companyId: "c-acme",
  publicOrigin: "https://acme.example.com",
  websiteOrigin: "https://www.example.com",
};

test("refuses an employee assigning an instance and leaves it unassigned", async ({
  orm,
  transact,
}) => {
  await expect(
    transact((tx) =>
      assignInstance(EMPLOYEE, tx, ACME, TEST_SECRET_BOX.encrypt(MANAGED_INSTANCE_CREDENTIAL)),
    ),
  ).rejects.toMatchObject({
    code: "FORBIDDEN",
  });

  expect((await readInstance(orm)).assignment).toBeNull();
});

test("stores the first assignment", async ({ orm, transact }) => {
  await assign(transact, ACME);

  expect((await readInstance(orm)).assignment).toEqual(ACME);
});

test("replaces the credential when the same assignment arrives again", async ({
  orm,
  transact,
}) => {
  await assign(transact, ACME);
  const replacement = TEST_SECRET_BOX.encrypt(`ib_${"b".repeat(64)}`);

  await assign(transact, { ...ACME }, replacement);

  expect((await readInstance(orm)).assignment).toEqual(ACME);
  expect(await instanceRepository(orm).readInstanceCredential()).toBe(replacement);
});

test.for([
  ["company", { companyId: "c-other" }],
  ["public origin", { publicOrigin: "https://other.example.com" }],
  ["website origin", { websiteOrigin: "https://other.example.com" }],
] as const)("refuses a different %s", async ([, change], { orm, transact }) => {
  const original = TEST_SECRET_BOX.encrypt(MANAGED_INSTANCE_CREDENTIAL);
  await assign(transact, ACME, original);
  const replacement = TEST_SECRET_BOX.encrypt(`ib_${"b".repeat(64)}`);

  await expect(assign(transact, { ...ACME, ...change }, replacement)).rejects.toBeInstanceOf(
    AssignmentConflictError,
  );
  expect((await readInstance(orm)).assignment).toEqual(ACME);
  expect(await instanceRepository(orm).readInstanceCredential()).toBe(original);
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

function assign(
  transact: Transact,
  assignment: ManagedAssignment,
  encryptedCredential = TEST_SECRET_BOX.encrypt(MANAGED_INSTANCE_CREDENTIAL),
) {
  return transact((tx) => assignInstance(SYSTEM, tx, assignment, encryptedCredential));
}
