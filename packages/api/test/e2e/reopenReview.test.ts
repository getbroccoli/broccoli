import {
  approveReviewedImport,
  expect,
  signInAsManagedOwner,
  startManagedEnv,
  test,
  TEST_OWNER,
} from "#test/support";

test.for(["managed", "self-hosted"] as const)(
  "%s setup goes Back to review and finishes with only the newly approved people",
  async (mode, { env: selfHosted }) => {
    const managed = mode === "managed" ? await startManagedEnv() : null;
    const env = managed?.env ?? selfHosted;
    const browser = managed
      ? await signInAsManagedOwner(managed.env, managed.accounts)
      : await env.startSetupAtImport();
    if (managed) {
      const company = await browser.graphql(
        'mutation { company { update(input: { name: "Acme" }) { company { id } error { __typename } } } }',
      );
      expect(await company.json()).toMatchObject({
        data: { company: { update: { error: null } } },
      });
    }
    const source = await env.seed.importSource();
    await env.seed.importEmployees(source.id, [
      { email: "avery@example.com" },
      { email: "robin@example.com" },
    ]);
    expect(await (await approveReviewedImport(browser)).json()).toEqual(APPROVED);

    const response = await browser.graphql(
      "mutation { import { reopenReview { import { id } } } }",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { import: { reopenReview: { import: { id: "import" } } } },
    });
    expect(await (await browser.graphql("{ setup { step } }")).json()).toEqual({
      data: { setup: { step: "IMPORT" } },
    });
    const leftOut = await browser.graphql(
      'mutation { import { setEmployeeLeftOut(employeeId: "robin@example.com", leftOut: true) { import { id } } } }',
    );
    expect(await leftOut.json()).toEqual({
      data: { import: { setEmployeeLeftOut: { import: { id: "import" } } } },
    });
    expect(await (await approveReviewedImport(browser)).json()).toEqual(APPROVED);
    if (managed) {
      const finished = await browser.graphql("mutation { setup { complete { setup { step } } } }");
      expect(await finished.json()).toEqual({
        data: { setup: { complete: { setup: { step: "DONE" } } } },
      });
    } else {
      expect((await browser.post("/api/auth/setup", TEST_OWNER)).status).toBe(200);
    }
    const directory = await browser.graphql(
      "{ setup { step } employees { edges { node { email } } } }",
    );
    expect(await directory.json()).toEqual({
      data: {
        setup: { step: "DONE" },
        employees: { edges: [{ node: { email: "avery@example.com" } }] },
      },
    });
  },
);

const APPROVED = { data: { import: { approve: { import: { id: "import" }, error: null } } } };
