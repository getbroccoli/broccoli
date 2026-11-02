/** Who the owner invites when setup finishes; a one-time choice, never stored. */
export const SETUP_INVITE_AUDIENCES = ["only_admins", "admins_and_managers", "everyone"] as const;

export type SetupInviteAudience = (typeof SETUP_INVITE_AUDIENCES)[number];

/** What the owner chose on "Who uses Broccoli", sent with setup's last step. */
export interface SetupChoices {
  /** The import employee the owner is, whose employee their user is linked to; null for none. */
  ownerEmployeeKey: string | null;
  inviteAudience: SetupInviteAudience;
  inviteNote: string | null;
}

/** Finishing setup without inviting anyone or linking the owner. */
export const NO_SETUP_INVITES: SetupChoices = {
  ownerEmployeeKey: null,
  inviteAudience: "only_admins",
  inviteNote: null,
};

/** The choices with what finishing needs: the owner's user and sign-in email, and where invite links point. */
export interface SetupFinish extends SetupChoices {
  ownerUserId: string;
  ownerEmail: string;
  linkOrigin: string;
}

/** An invite setup made; the link only when the owner copies it, and only in this answer. */
export interface SetupInvite {
  employeeId: string;
  name: string;
  expiresAt: Date;
  link: string | null;
}
