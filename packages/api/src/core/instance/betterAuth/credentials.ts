import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { z } from "zod";

/** The email and password a setup form sends. */
export const credentialsBody = z.object({
  email: z.string(),
  password: z.string(),
});

/** Refuses an invalid email, or a password outside Better Auth's length limits, as it would. */
export function assertValidCredentials(
  { email, password }: z.infer<typeof credentialsBody>,
  limits: { minPasswordLength: number; maxPasswordLength: number },
): void {
  if (!z.email().safeParse(email).success) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.INVALID_EMAIL);
  }
  if (password.length < limits.minPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_SHORT);
  }
  if (password.length > limits.maxPasswordLength) {
    throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PASSWORD_TOO_LONG);
  }
}

/** Gives the user a password sign-in. */
export async function linkPassword(
  ctx: GenericEndpointContext,
  userId: string,
  passwordHash: string,
): Promise<void> {
  await ctx.context.internalAdapter.linkAccount({
    userId,
    providerId: "credential",
    accountId: userId,
    password: passwordHash,
  });
}
