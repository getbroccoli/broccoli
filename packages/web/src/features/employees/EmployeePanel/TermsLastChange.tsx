import { useQuery } from "@apollo/client/react";
import { useNavigate, useRouteContext } from "@tanstack/react-router";

import { RecordHistoryDocument } from "@/__generated__/graphql";
import { authorName } from "@/features/records";
import { t } from "@/i18n";
import { shortDate } from "@/features/termsDisplay";
import { calendarDayOf } from "@/lib/calendarDay";

import { EMPLOYMENT_TERMS_FIELDS } from "./employeeHistoryArea";

type Props = {
  employeeId: string;
};

/** Who last changed a person's employment terms and when, with a way to their History filtered to it. */
export function TermsLastChange({ employeeId }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate({ from: "/people/$employeeId" });
  const { data } = useQuery(RecordHistoryDocument, {
    variables: {
      recordType: "EMPLOYEE",
      recordId: employeeId,
      first: 1,
      changingAnyOf: EMPLOYMENT_TERMS_FIELDS,
    },
    fetchPolicy: "cache-and-network",
  });
  const line = data?.recordHistory.edges[0]?.node;
  if (!line) return null;

  return (
    <p className="px-1 text-[13px] text-muted-foreground">
      {t("people.panel.terms.lastChanged", {
        author: authorName(line.author, me.id),
        date: shortDate(calendarDayOf(new Date(line.occurredAt))),
      })}
      {" · "}
      <button
        type="button"
        className="text-foreground underline decoration-border underline-offset-3"
        onClick={() =>
          void navigate({
            search: (previous) => ({ ...previous, tab: "history", changes: "employmentTerms" }),
          })
        }
      >
        {t("people.panel.terms.seeHistory")}
      </button>
    </p>
  );
}
