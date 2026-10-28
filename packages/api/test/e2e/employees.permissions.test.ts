import { expect, TEST_OWNER, test } from "#test/support";

test("sets a joined employee's permission profiles through the API with its history line", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const user = await env.seed.user({ email: "anna@example.com" });
  const employee = await env.seed.employee({ userId: user.id });

  const response = await browser.graphql(
    `
    mutation SetPermissionProfiles($input: EmployeeSetPermissionProfilesInput!) {
      employee { setPermissionProfiles(input: $input) {
        employee { id permissionProfiles }
        historyLine { id changes { field oldValue newValue } }
        error { __typename ... on Error { message } }
      } }
    }
  `,
    { input: { id: employee.id, profiles: ["ADMIN"] } },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        setPermissionProfiles: {
          employee: { id: employee.id, permissionProfiles: ["EMPLOYEE", "ADMIN"] },
          historyLine: {
            id: expect.any(String) as unknown,
            changes: [
              { field: "permissionProfiles", oldValue: "EMPLOYEE", newValue: "EMPLOYEE, ADMIN" },
            ],
          },
          error: null,
        },
      },
    },
  });
});

test("refuses assigning OWNER through the permission profiles mutation", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const user = await env.seed.user({ email: "anna@example.com" });
  const employee = await env.seed.employee({ userId: user.id });

  const response = await browser.graphql(
    `
    mutation SetPermissionProfiles($input: EmployeeSetPermissionProfilesInput!) {
      employee { setPermissionProfiles(input: $input) {
        employee { id }
        error { __typename ... on Error { message } ... on InvalidInputError { fields { field code } } }
      } }
    }
  `,
    { input: { id: employee.id, profiles: ["OWNER"] } },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        setPermissionProfiles: {
          employee: null,
          error: {
            __typename: "InvalidInputError",
            message: "The input is invalid.",
            fields: [{ field: "profiles", code: "not_assignable" }],
          },
        },
      },
    },
  });
});

test("returns every editable field and deletion access to the owner", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee();

  const response = await browser.graphql(
    `
    query Employee($id: ID!) {
      employee(id: $id) { id access { canUpdate canDelete editableFields } }
    }
  `,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        access: {
          canUpdate: true,
          canDelete: true,
          editableFields: [
            "firstName",
            "lastName",
            "email",
            "jobTitle",
            "startDate",
            "managerId",
            "avatar",
          ],
        },
      },
    },
  });
});

test("returns an employee's own writable fields and permission profiles", async ({ env }) => {
  await env.seed.owner();
  const credentials = { email: "anna@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  const employee = await env.seed.employee({ userId: user.id });
  const { browser } = await env.signIn(credentials);

  const response = await browser.graphql(
    `
    query Employee($id: ID!) {
      employee(id: $id) { id permissionProfiles access { canUpdate canDelete editableFields } }
    }
  `,
    { id: employee.id },
  );

  expect(await response.json()).toEqual({
    data: {
      employee: {
        id: employee.id,
        permissionProfiles: ["EMPLOYEE"],
        access: {
          canUpdate: true,
          canDelete: false,
          editableFields: ["firstName", "lastName", "avatar"],
        },
      },
    },
  });
});

test("refuses an employee updating a coworker's job title through GraphQL", async ({ env }) => {
  await env.seed.owner();
  const credentials = { email: "anna@example.com", password: TEST_OWNER.password };
  const user = await env.seed.user(credentials);
  await env.seed.employee({ userId: user.id });
  const coworker = await env.seed.employee();
  const { browser } = await env.signIn(credentials);

  const response = await browser.graphql(
    `
    mutation UpdateEmployee($input: EmployeeUpdateInput!) {
      employee { update(input: $input) {
        employee { id }
        error { __typename ... on Error { message } }
      } }
    }
  `,
    { input: { id: coworker.id, jobTitle: "Lead" } },
  );

  expect(await response.json()).toMatchObject({
    errors: [
      {
        message: "You are not allowed to do this.",
        extensions: { code: "FORBIDDEN" },
      },
    ],
  });
});
