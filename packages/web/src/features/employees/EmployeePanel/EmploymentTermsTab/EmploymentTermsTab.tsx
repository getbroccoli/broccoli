import { useQuery } from "@apollo/client/react";

import { EmploymentTermsTabDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { TermsCard } from "./TermsCard";

type Props = {
  employeeId: string;
  firstName: string;
  /** The person reads about themselves: "your terms", "Your own". */
  viewerIsPerson: boolean;
  /** Admins see each terms' name as a link to its settings. */
  linksToSettings: boolean;
};

/**
 * A person's terms, working week and each time off type's rules, today and planned, and earlier
 * terms; read each time the tab shows, since Settings may have planned changes meanwhile.
 */
export function EmploymentTermsTab({ employeeId, ...props }: Props) {
  const { data, error, refetch } = useQuery(EmploymentTermsTabDocument, {
    variables: { id: employeeId },
    fetchPolicy: "cache-and-network",
  });
  const employmentTerms = data?.employee?.employmentTerms;
  if (error) {
    return (
      <div role="alert" className="flex items-center gap-3 text-sm text-muted-foreground">
        {t("people.panel.terms.loadError")}
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {t("people.error.retry")}
        </Button>
      </div>
    );
  }
  return employmentTerms ? (
    <TermsCard employeeId={employeeId} employmentTerms={employmentTerms} {...props} />
  ) : (
    <Skeleton className="h-64 w-full" />
  );
}
