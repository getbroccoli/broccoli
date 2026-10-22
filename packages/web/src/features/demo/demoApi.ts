import { postJson } from "@/lib/postJson";

/**
 * Starts the demo in place of the import for the browser holding setup, which the API
 * signs in as the demo's owner. Returns whether it started.
 */
export async function startDemoSetup(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/setup/demo", {})).ok;
  } catch {
    return false;
  }
}

/**
 * Ends the self-hosted demo and takes setup back to the company step; the API makes this
 * browser the holder of setup again. Returns whether it did.
 */
export async function resetDemo(): Promise<boolean> {
  try {
    return (await postJson("/api/auth/setup/demo/reset", {})).ok;
  } catch {
    return false;
  }
}
