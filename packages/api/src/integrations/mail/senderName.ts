/**
 * The display name an email comes from: the person who sent it, or the company when nobody did.
 * Broccoli's relay adds "via Broccoli" itself; any other mailer says "via <company>".
 */
export function senderName(personName: string | null, companyName: string, viaBroccoli: boolean) {
  if (!personName) return companyName;
  return viaBroccoli ? personName : `${personName} via ${companyName}`;
}
