import {
  EmploymentTermsDocument,
  EmploymentTermsStackDocument,
  type EmploymentTermsStackQuery,
  RecordHistoryDocument,
} from "@/__generated__/graphql";

/** One set of terms as the stack reads it. */
export type Terms = NonNullable<EmploymentTermsStackQuery["terms"]>;

/** One time off type on the terms, with its rules. */
export type TimeOffRow = Terms["timeOff"][number];

/** What a change to terms refreshes: the stack, the list and history. */
export const TERMS_REFETCH = [
  EmploymentTermsStackDocument,
  EmploymentTermsDocument,
  RecordHistoryDocument,
];
