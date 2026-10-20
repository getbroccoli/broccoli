/** The model's answer is well formed but names rows or words it may not; retrying will not help. */
export class InvalidModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidModelOutputError";
  }
}

/** Something other than masked evidence was about to leave; the extraction stops. */
export class PrivacyViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivacyViolationError";
  }
}
