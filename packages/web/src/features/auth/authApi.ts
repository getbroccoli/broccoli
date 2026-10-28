import { postJson } from "@/lib/postJson";

/** How a sign-in attempt ended, as the login form reports it. */
export type SignInResult = "ok" | "invalidCredentials" | "tooManyAttempts" | "failed";

const SIGN_IN_RESULT_BY_STATUS: Partial<Record<number, SignInResult>> = {
  200: "ok",
  401: "invalidCredentials",
  429: "tooManyAttempts",
};

/** Signs in with email and password; the API sets the session cookie. */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  try {
    const response = await postJson("/api/auth/sign-in/email", { email, password });
    return SIGN_IN_RESULT_BY_STATUS[response.status] ?? "failed";
  } catch {
    return "failed";
  }
}

/** How a request for a reset link ended; the same for every address. */
export type PasswordResetRequestResult = "ok" | "tooManyAttempts" | "failed";

/** Asks for a link to reset the password of `email`; the answer never says whether it has an account. */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  try {
    const response = await postJson("/api/auth/request-password-reset", { email });
    return response.ok ? "ok" : response.status === 429 ? "tooManyAttempts" : "failed";
  } catch {
    return "failed";
  }
}

/** How choosing a new password ended; `linkInvalid` for a used, expired or unknown link. */
export type PasswordResetResult = "ok" | "linkInvalid" | "failed";

/** Sets a new password with the token of a reset link; every session of that user ends. */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<PasswordResetResult> {
  try {
    const response = await postJson("/api/auth/reset-password", { token, newPassword });
    return response.ok ? "ok" : response.status === 400 ? "linkInvalid" : "failed";
  } catch {
    return "failed";
  }
}

/** Ends the session on the server; false when it could not. */
export async function signOut(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/sign-out", {})).ok;
  } catch {
    return false;
  }
}
