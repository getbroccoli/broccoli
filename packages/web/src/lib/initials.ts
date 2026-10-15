/** A person's initials, by code point, so a name starting with an emoji or astral letter keeps it whole. */
export function initialsOf(firstName: string, lastName: string): string {
  const [first = ""] = firstName;
  const [last = ""] = lastName;
  return `${first}${last}`.toUpperCase();
}
