/** A token that is not a valid init token or sign-in ticket for this instance. */
export class InvalidTokenError extends Error {
  constructor() {
    super("The token is not valid here");
    this.name = "InvalidTokenError";
  }
}

/** A correctly signed init token whose assignment cannot be used. */
export class InvalidAssignmentError extends Error {
  constructor() {
    super("The signed assignment is malformed");
    this.name = "InvalidAssignmentError";
  }
}

/** Who a ticket signs in, and what makes it usable once. */
export interface ManagedTicket {
  subject: string;
  /** Lowercased. */
  email: string;
  /** May be empty. */
  name: string;
  company: string;
  state: string;
  jti: string;
  expiresAt: Date;
}
