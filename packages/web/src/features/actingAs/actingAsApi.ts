import { postJson } from "@/lib/postJson";

/** How starting to act as someone ended: `notAllowed` when the API refused this person. */
export type ActAsResult = "ok" | "notAllowed" | "failed";

/** Makes this browser's session act as the employee. */
export async function actAs(employeeId: string): Promise<ActAsResult> {
  try {
    const response = await postJson("/api/auth/act-as", { employeeId });
    return response.ok ? "ok" : response.status === 403 ? "notAllowed" : "failed";
  } catch {
    return "failed";
  }
}

/** Makes this browser's session act as its signed-in user again; false when it could not. */
export async function stopActing(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/act-as/stop", {})).ok;
  } catch {
    return false;
  }
}
