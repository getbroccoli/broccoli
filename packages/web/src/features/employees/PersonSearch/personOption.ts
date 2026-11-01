/** A person a search found, with a short detail such as their job title. */
export type PersonOption = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  detail: string | null;
};

/** "Avery Stone", from the names a person has. */
export function personName({ firstName, lastName }: PersonOption): string {
  return [firstName, lastName].filter(Boolean).join(" ");
}
