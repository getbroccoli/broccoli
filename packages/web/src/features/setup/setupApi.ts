import { postJson } from "@/lib/postJson";

/** How an attempt to create the owner ended, as the setup form reports it. */
export type SetupResult = "ok" | "invalidInput" | "conflict" | "tooManyAttempts" | "failed";

const SETUP_RESULT_BY_STATUS: Partial<Record<number, SetupResult>> = {
  200: "ok",
  400: "invalidInput",
  // Another account already has the email.
  422: "invalidInput",
  // The owner exists, another browser holds setup, or setup is at another step.
  409: "conflict",
  429: "tooManyAttempts",
};

/**
 * Starts setup in this browser, or renews it for the browser holding it; the API sets
 * the setup cookie. Returns whether this browser holds setup.
 */
export async function startSetup(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/setup/start", {})).ok;
  } catch {
    return false;
  }
}

/** Creates the instance's owner and signs them in; the API sets the session cookie. */
export function setUpOwner(email: string, password: string): Promise<SetupResult> {
  return postCredentials("/api/auth/setup", email, password);
}

async function postCredentials(
  path: string,
  email: string,
  password: string,
): Promise<SetupResult> {
  try {
    const response = await postJson(path, { email, password });
    return SETUP_RESULT_BY_STATUS[response.status] ?? "failed";
  } catch {
    return "failed";
  }
}
