import { expect, test } from "#test/support";

test("creates a location and assigns a person to it through the API", async ({ env }) => {
  const { browser } = await env.signInAsOwner();
  const employee = await env.seed.employee();

  const created = await browser.graphql(`mutation CreateLocation {
    employees { createLocation(input: { name: "Leeds" }) {
      location { id name }
      error { __typename ... on Error { message } }
    } }
  }`);
  const body = (await created.json()) as {
    data: {
      employees: { createLocation: { location: { id: string; name: string }; error: null } };
    };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.employees.createLocation.error).toBeNull();
  const location = body.data.employees.createLocation.location;
  expect(location.name).toBe("Leeds");

  const updated = await browser.graphql(
    `mutation SetLocation($input: EmployeeUpdateInput!) {
    employees { update(input: $input) {
      employee { id location { id name } }
      error { __typename ... on Error { message } }
    } }
  }`,
    { input: { id: employee.id, locationId: location.id } },
  );
  expect(await updated.json()).toEqual({
    data: { employees: { update: { employee: { id: employee.id, location }, error: null } } },
  });

  const listed = await browser.graphql(`query Locations { locations { id name peopleCount } }`);
  expect(await listed.json()).toEqual({ data: { locations: [{ ...location, peopleCount: 1 }] } });
});

test("an admin chooses a location's terms and clears them back to the default terms", async ({
  env,
}) => {
  const { browser } = await env.signInAsOwner();
  const termsId = await env.seed.terms("Scotland");

  const created = await browser.graphql(
    `mutation CreateLocation($input: LocationCreateInput!) {
      employees { createLocation(input: $input) {
        location { id }
        error { __typename }
      } }
    }`,
    { input: { name: "Glasgow", termsId } },
  );
  const body = (await created.json()) as {
    data: { employees: { createLocation: { location: { id: string }; error: null } } };
  };
  expect(body).not.toHaveProperty("errors");
  expect(body.data.employees.createLocation.error).toBeNull();
  const { id } = body.data.employees.createLocation.location;

  const listed = await browser.graphql(`query Locations {
    locations { id name terms { id name isDefault } }
  }`);
  expect(await listed.json()).toEqual({
    data: {
      locations: [
        { id, name: "Glasgow", terms: { id: termsId, name: "Scotland", isDefault: false } },
      ],
    },
  });

  const cleared = await browser.graphql(
    `mutation ClearLocationTerms($id: ID!) {
      employees { updateLocation(input: { id: $id, termsId: null }) {
        location { terms { isDefault } }
        error { __typename }
      } }
    }`,
    { id },
  );
  expect(await cleared.json()).toEqual({
    data: {
      employees: { updateLocation: { location: { terms: { isDefault: true } }, error: null } },
    },
  });
});
