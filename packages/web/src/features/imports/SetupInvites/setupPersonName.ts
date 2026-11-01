import type { SetupPersonFragment } from "@/__generated__/graphql";

/** "Avery Stone", from the names an import employee has. */
export function setupPersonName({ firstName, lastName }: SetupPersonFragment): string {
  return [firstName.value, lastName.value].filter(Boolean).join(" ");
}
