import { postJson } from "@/lib/post-json";

/** How an attempt to create the owner ended, as the setup form reports it. */
export type SetupResult = "ok" | "invalidInput" | "ownerExists" | "tooManyAttempts" | "failed";

const SETUP_RESULT_BY_STATUS: Partial<Record<number, SetupResult>> = {
  200: "ok",
  400: "invalidInput",
  409: "ownerExists",
  429: "tooManyAttempts",
};

/** Creates the instance's owner and signs them in; the API sets the session cookie. */
export async function setUpOwner(email: string, password: string): Promise<SetupResult> {
  try {
    const response = await postJson("/api/auth/setup", { email, password });
    return SETUP_RESULT_BY_STATUS[response.status] ?? "failed";
  } catch {
    return "failed";
  }
}
