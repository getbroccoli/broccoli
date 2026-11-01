import { useQuery } from "@apollo/client/react";

import { EmployeeOptionsDocument } from "@/__generated__/graphql";

import { type PersonOption, PersonSearch, usePersonSearch } from "../PersonSearch";

type Props = {
  label: string;
  /** The person whose field this is, never offered. */
  excludedId?: string;
  /** The picked person's id; "" is none. */
  selectedId: string;
  /** Called with the person, or null for none. */
  onPick: (person: PersonOption | null) => void;
};

/** Searches employees by name or email to pick one, or none. */
export function EmployeeSearch({ label, excludedId, selectedId, onPick }: Props) {
  const { search, setSearch, typed, query } = usePersonSearch();
  const { data, previousData, loading, error } = useQuery(EmployeeOptionsDocument, {
    variables: { search: query || null },
    // People change while the search is open, so a repeated search asks again.
    fetchPolicy: "cache-and-network",
  });
  const people =
    (data ?? previousData)?.employees.edges
      .map(({ node }) => node)
      .filter(({ id }) => id !== excludedId)
      .map((person) => ({ ...person, detail: person.jobTitle })) ?? [];
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
