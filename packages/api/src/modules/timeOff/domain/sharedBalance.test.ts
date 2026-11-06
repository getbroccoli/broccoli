import { expect, it } from "vitest";

import { sharedBalance } from "./sharedBalance";

it("takes the kind most policies share over the oldest policy's", () => {
  const policies = [
    policy("019a0000-0001-7000-8000-000000000001", "balance_from_allowance"),
    policy("019a0000-0002-7000-8000-000000000001", "unlimited_balance"),
    policy("019a0000-0003-7000-8000-000000000001", "unlimited_balance"),
  ];

  expect(sharedBalance(policies)).toBe("unlimited_balance");
});

it("takes the oldest policy's kind on a tie, whatever the input order", () => {
  const policies = [
    policy("019a0000-0002-7000-8000-000000000001", "unlimited_balance"),
    policy("019a0000-0001-7000-8000-000000000001", "balance_from_allowance"),
  ];

  expect(sharedBalance(policies)).toBe("balance_from_allowance");
});

it("returns null without policies", () => {
  expect(sharedBalance([])).toBeNull();
});

function policy(id: string, balance: "balance_from_allowance" | "unlimited_balance") {
  return { id, balance };
}
