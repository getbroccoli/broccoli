/** "costCenter" or "APPLIED_SCHEDULED_CHANGE" as "Cost center" or "Applied scheduled change". */
export function sentenceCase(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
