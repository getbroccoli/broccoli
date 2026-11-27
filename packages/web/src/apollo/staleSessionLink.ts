import { ApolloLink } from "@apollo/client";
import { throwError } from "rxjs";

/** Set once another tab changed whom the session acts as; this page then sends nothing more. */
let stale = false;

/** Marks this page out of date: it shows one identity while the session is another's. */
export function markSessionStale(): void {
  stale = true;
}

/**
 * Refuses every request once the page is out of date, such as one kept open with an unsaved edit
 * while another tab started or stopped acting, so nothing is read or saved as the wrong person.
 */
export function staleSessionLink(): ApolloLink {
  return new ApolloLink((operation, forward) =>
    stale
      ? throwError(() => new Error("This page is out of date; reload it."))
      : forward(operation),
  );
}
