/** How notifications read the person they email; the employees module fills it. */
export interface NotificationPeoplePort {
  /** The employee's work email and whether they joined (have a user); null when gone. */
  readRecipient(employeeId: string): Promise<{ email: string; joined: boolean } | null>;
}
