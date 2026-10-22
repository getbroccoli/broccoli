/** How a managed owner proves who they are at the accounts service; learned from their sign-in tickets. */
export const OWNER_SIGN_IN_METHODS = ["sign_in_with_google", "sign_in_with_email"] as const;

export type OwnerSignInMethod = (typeof OWNER_SIGN_IN_METHODS)[number];
