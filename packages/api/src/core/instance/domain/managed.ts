/** The company a managed instance serves, as its signed init assigned it. */
export interface ManagedAssignment {
  /** Sent to the website as `?company=`; tickets must name it. */
  companyId: string;
  /** Where browsers reach the instance; the audience of its tickets. */
  publicOrigin: string;
  /** The only origin allowed to post tickets, and the host of the entry page. */
  websiteOrigin: string;
}

/** An instance is assigned once; a different assignment, or one after self-hosted setup, is refused. */
export class AssignmentConflictError extends Error {
  constructor() {
    super("The instance is already assigned");
    this.name = "AssignmentConflictError";
  }
}
