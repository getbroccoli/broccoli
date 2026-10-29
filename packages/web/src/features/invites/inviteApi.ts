import { postJson } from "@/lib/postJson";

/** What the invite page shows about the invite behind its link. */
export interface InviteDetails {
  companyName: string;
  inviterFirstName: string | null;
  firstName: string;
  email: string;
  expiresAt: string;
}

/** The invite behind a token; `invalid` for a used, cancelled, replaced, expired or unknown link. */
export async function lookUpInvite(token: string): Promise<InviteDetails | "invalid" | "failed"> {
  try {
    const response = await postJson("/api/auth/invite/lookup", { token });
    if (response.status === 400) return "invalid";
    return response.ok ? ((await response.json()) as InviteDetails) : "failed";
  } catch {
    return "failed";
  }
}

/** How joining ended; on `ok` the API set the session cookie. */
export type AcceptResult = "ok" | "invalid" | "tooManyAttempts" | "failed";

/** Sets the person's password and signs them in, with the token of their invite link. */
export async function acceptInvite(token: string, password: string): Promise<AcceptResult> {
  try {
    const response = await postJson("/api/auth/invite/accept", { token, password });
    if (response.ok) return "ok";
    if (response.status === 429) return "tooManyAttempts";
    if (response.status !== 400) return "failed";
    const { code } = (await response.json()) as { code?: string };
    return code === "INVITE_LINK_INVALID" ? "invalid" : "failed";
  } catch {
    return "failed";
  }
}
