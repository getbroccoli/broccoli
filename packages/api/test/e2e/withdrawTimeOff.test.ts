import { expect, setUpRequests, submitRequest, test } from "#test/support";

test("an employee withdraws their request and sees who cancelled it", async ({ env }) => {
  const { amira, input } = await setUpRequests(env);
  const id = await submitRequest(amira.browser, input);

  const cancelled = await amira.browser.graphql(
    `mutation Withdraw($id: ID!) { timeOff {
      cancelTimeOff(input: { timeOffId: $id }) { cancelledTimeOffId error { __typename } }
    } }`,
    { id },
  );
  expect(await cancelled.json()).toEqual({
    data: { timeOff: { cancelTimeOff: { cancelledTimeOffId: id, error: null } } },
  });

  const requests = await amira.browser.graphql(
    `query Requests($id: ID!) { employee(id: $id) {
      timeOffRequests { id status canCancel cancellation { cancelledBy { id } } }
    } }`,
    { id: amira.id },
  );
  const withdrawn = {
    id,
    status: "CANCELLED",
    canCancel: false,
    cancellation: { cancelledBy: { id: amira.id } },
  };
  expect(await requests.json()).toEqual({ data: { employee: { timeOffRequests: [withdrawn] } } });
});
