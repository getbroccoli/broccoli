import { useQuery } from "@apollo/client/react";

import { ImportPersonOptionsDocument } from "@/__generated__/graphql";
import { type PersonOption, PersonSearch, usePersonSearch } from "@/features/employees";

type Props = {
  label: string;
  /** The import employee whose manager this is, never offered. */
  excludedId?: string;
  /** The picked import employee's id; "" is none. */
  selectedId: string;
  /** Called with the import employee, or null for none. */
  onPick: (person: PersonOption | null) => void;
};

/** Searches the people Approve would add, by name or email, to pick one, or none. */
export function ImportPersonSearch({ label, excludedId, selectedId, onPick }: Props) {
  const { search, setSearch, typed, query } = usePersonSearch();
  const { data, previousData, loading, error } = useQuery(ImportPersonOptionsDocument, {
    variables: { search: query || null },
    // Review edits change who matches, so a repeated search asks again.
    fetchPolicy: "cache-and-network",
  });
  const people =
    (data ?? previousData)?.import.employees.edges
      .map(({ node }) => node)
      .filter(({ id }) => id !== excludedId)
      .map((node) => ({
        id: node.id,
        firstName: node.firstName.value,
        lastName: node.lastName.value,
        avatarUrl: node.avatarUrl ?? null,
        detail: node.jobTitle.value,
      })) ?? [];
  return (
    <PersonSearch
      label={label}
      search={search}
      onSearchChange={setSearch}
      people={people}
      selectedId={selectedId}
      settled={query === typed && !loading && Boolean(data)}
      failed={Boolean(error)}
      onPick={onPick}
    />
  );
}
