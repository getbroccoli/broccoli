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

/** Ends the session on the server; false when it could not. */
export async function signOut(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/sign-out", {})).ok;
  } catch {
    return false;
  }
}
