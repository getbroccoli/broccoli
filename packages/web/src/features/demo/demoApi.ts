import { postJson } from "@/lib/postJson";

/**
 * Ends the demo and takes setup back to the company step; the API makes this browser the
 * holder of setup again. Returns whether it did.
 */
export async function resetDemo(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/setup/demo/reset", {})).ok;
  } catch {
    return false;
  }
}
