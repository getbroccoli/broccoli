import { assert, expect, it } from "vitest";
import { z } from "zod";

import { fieldErrorsOf } from "./fieldErrors";

it("maps small, large and other issues to required, too_long and invalid", () => {
  const schema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().max(3),
    email: z.email(),
  });
  const result = schema.safeParse({ firstName: "", lastName: "Long", email: "invalid" });
  assert(result.error);

  expect(fieldErrorsOf(result.error)).toEqual([
    { field: "firstName", code: "required" },
    { field: "lastName", code: "too_long" },
    { field: "email", code: "invalid" },
  ]);
});

it("keeps only the first issue for a field", () => {
  const schema = z.object({
    firstName: z
      .string()
      .min(1)
      .regex(/^[A-Z]/),
  });
  const result = schema.safeParse({ firstName: "" });
  assert(result.error);

  expect(fieldErrorsOf(result.error)).toEqual([{ field: "firstName", code: "required" }]);
});

it("groups nested issues under their top-level field and keeps the first", () => {
  const schema = z.object({
    employee: z.object({ firstName: z.string().min(1), email: z.email() }),
  });
  const result = schema.safeParse({ employee: { firstName: "", email: "invalid" } });
  assert(result.error);

  expect(fieldErrorsOf(result.error)).toEqual([{ field: "employee", code: "required" }]);
});
