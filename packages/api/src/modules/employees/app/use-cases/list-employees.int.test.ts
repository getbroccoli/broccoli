import { expect, OWNER, test } from "#test/support";

import { createEmployeeUseCases } from ".";

test("lists employees in name order across pages", async ({ orm, seed }) => {
  const { listEmployees } = createEmployeeUseCases({ orm });
  const zoe = await seed.employee({ firstName: "Zoe", lastName: "Adams" });
  const samZ = await seed.employee({ firstName: "Sam", lastName: "Zimmer" });
  const ada = await seed.employee({ firstName: "ada", lastName: "Stone" });
  const samA = await seed.employee({ firstName: "sam", lastName: "adams" });
  const ben = await seed.employee({ firstName: "Ben", lastName: "Young" });

  const firstPage = await listEmployees(OWNER, { first: 2 });

  expect(firstPage.edges.map((edge) => edge.node.id)).toEqual([ada.id, ben.id]);
  expect(firstPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.edges.at(-1)?.cursor,
  });

  const secondPage = await listEmployees(OWNER, {
    first: 2,
    after: firstPage.pageInfo.endCursor,
  });

  expect(secondPage.edges.map((edge) => edge.node.id)).toEqual([samA.id, samZ.id]);
  expect(secondPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: secondPage.edges.at(-1)?.cursor,
  });

  const thirdPage = await listEmployees(OWNER, {
    first: 2,
    after: secondPage.pageInfo.endCursor,
  });

  expect(thirdPage.edges.map((edge) => edge.node.id)).toEqual([zoe.id]);
  expect(thirdPage.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: thirdPage.edges.at(-1)?.cursor,
  });
});

test("pages stably through employees with the same name", async ({ orm, seed }) => {
  const { listEmployees } = createEmployeeUseCases({ orm });
  const firstSam = await seed.employee({ firstName: "Sam", lastName: "Lee" });
  const secondSam = await seed.employee({ firstName: "Sam", lastName: "Lee" });
  const [firstId, secondId] = [firstSam.id, secondSam.id].sort();

  const firstPage = await listEmployees(OWNER, { first: 1 });

  expect(firstPage.edges.map((edge) => edge.node.id)).toEqual([firstId]);
  expect(firstPage.pageInfo).toEqual({
    hasNextPage: true,
    endCursor: firstPage.edges.at(-1)?.cursor,
  });

  const secondPage = await listEmployees(OWNER, {
    first: 1,
    after: firstPage.pageInfo.endCursor,
  });

  expect(secondPage.edges.map((edge) => edge.node.id)).toEqual([secondId]);
  expect(secondPage.pageInfo).toEqual({
    hasNextPage: false,
    endCursor: secondPage.edges.at(-1)?.cursor,
  });
});

test("refuses an anonymous actor", async ({ orm }) => {
  const { listEmployees } = createEmployeeUseCases({ orm });

  await expect(listEmployees(null, {})).rejects.toMatchObject({
    code: "UNAUTHENTICATED",
    message: "Sign in to continue.",
    fieldErrors: [],
  });
});

test("refuses a signed-in user who is not the owner", async ({ orm }) => {
  const { listEmployees } = createEmployeeUseCases({ orm });

  await expect(listEmployees({ userId: "user-1", isOwner: false }, {})).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Only the owner can do this.",
    fieldErrors: [],
  });
});
