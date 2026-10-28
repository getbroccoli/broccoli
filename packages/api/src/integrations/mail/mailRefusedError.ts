/** The provider refused an email or could not be reached; retryable when a later try may work. */
export class MailRefusedError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** The provider's own words, for the owner; may name addresses, so never logged. */
    readonly providerReason: string | null = null,
  ) {
    super(message);
    this.name = "MailRefusedError";
  }
}
