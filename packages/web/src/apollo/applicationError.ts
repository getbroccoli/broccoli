import { CombinedGraphQLErrors } from "@apollo/client";
import { z } from "zod";

const applicationErrorExtensions = z.object({
  code: z.string(),
  fieldErrors: z.array(z.object({ field: z.string(), code: z.string() })).default([]),
});

/** The API's expected failure (`extensions.code` and `fieldErrors`) behind an Apollo error. */
export type ApplicationError = z.infer<typeof applicationErrorExtensions>;

export function applicationErrorOf(error: unknown): ApplicationError | undefined {
  if (!CombinedGraphQLErrors.is(error)) return undefined;
  const parsed = applicationErrorExtensions.safeParse(error.errors[0]?.extensions);
  return parsed.success ? parsed.data : undefined;
}
