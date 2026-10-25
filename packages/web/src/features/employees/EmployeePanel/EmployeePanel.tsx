import { useQuery } from "@apollo/client/react";
import { X } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { EmployeePanelDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { EmployeeRecord } from "./EmployeeRecord";

type Props = {
  employeeId: string;
  /** Closes the panel; navigation asks first when there are unsaved changes. */
  onClose: () => void;
};

/** A person's panel over People: their details, edited in place, and their history. */
export function EmployeePanel({ employeeId, onClose }: Props) {
  const { data, error, loading, refetch } = useQuery(EmployeePanelDocument, {
    variables: { id: employeeId },
  });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined}>
        {data?.employee ? (
          <EmployeeRecord key={data.employee.id} employee={data.employee} onClose={onClose} />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                {loading ? <Skeleton className="h-6 w-48" /> : null}
                {!loading && (error ? t("people.panel.loadError") : t("people.panel.notFound"))}
              </SheetTitle>
              <SheetClose
                render={<Button variant="ghost" size="icon" aria-label={t("people.panel.close")} />}
              >
                <X />
              </SheetClose>
            </div>
            {!loading && error && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void refetch()}
              >
                {t("people.error.retry")}
              </Button>
            )}
            {!loading && !error && (
              <Link
                to="/people"
                search={(previous) => previous}
                className="text-sm underline underline-offset-2"
              >
                {t("people.panel.backToPeople")}
              </Link>
            )}
            {loading && <Skeleton className="h-40 w-full" />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
