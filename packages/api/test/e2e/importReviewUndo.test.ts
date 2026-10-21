import { connectAndReadSlack, expect, slackTest as test } from "#test/support";

test("undoes a review choice over GraphQL and returns ConflictError when repeated", async ({
  env,
  slack,
}) => {
  slack.pages[0] = [
    {
      id: "U1",
      profile: {
        first_name: "Avery",
        last_name: "Stone",
        email: "avery@example.com",
        title: "Engineer",
      },
    },
  ];
  const { browser } = await env.signInAsOwner();
  await connectAndReadSlack(browser);
  const chosen = await browser.graphql(`mutation {
    import { chooseEmployeeValue(input: { employeeId: "avery@example.com", field: JOB_TITLE, value: "Lead" }) {
      import { id } error { __typename ... on Error { message } }
    } }
  }`);
  expect(await chosen.json()).toEqual({
    data: { import: { chooseEmployeeValue: { import: { id: "import" }, error: null } } },
  });
  const response = await browser.graphql("query { import { id latestReviewChange { id } } }");
  const review = await response.json();
  expect(review).toMatchObject({
    data: { import: { latestReviewChange: { id: expect.any(String) as unknown } } },
  });
  const { data } = review as { data: { import: { latestReviewChange: { id: string } } } };
  const undo = `mutation($id: ID!) {
    import { undoReviewChange(id: $id) {
      import { id latestReviewChange { id } employees { edges { node { id jobTitle { value choice } } } } }
      error { __typename ... on Error { message } }
    } }
  }`;

  const undone = await browser.graphql(undo, { id: data.import.latestReviewChange.id });

  expect(await undone.json()).toEqual({
    data: {
      import: {
        undoReviewChange: {
          import: {
            id: "import",
            latestReviewChange: null,
            employees: {
              edges: [
                {
                  node: {
                    id: "avery@example.com",
                    jobTitle: { value: "Engineer", choice: "DEFAULT" },
                  },
                },
              ],
            },
          },
          error: null,
        },
      },
    },
  });
  const repeated = await browser.graphql(undo, { id: data.import.latestReviewChange.id });
  expect(await repeated.json()).toEqual({
    data: {
      import: {
        undoReviewChange: {
          import: null,
          error: {
            __typename: "ConflictError",
            message: "Review changed since; nothing was undone.",
          },
        },
      },
    },
  });
});
