import { useQuery } from "@apollo/client/react";
import { X } from "@phosphor-icons/react";

import { TimeOffTypePanelDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { TimeOffTypeEditor } from "./TimeOffTypeEditor";

type Props = {
  timeOffTypeId: string;
  /** A policy to scroll to, from a policy row in the list. */
  policyId: string | null;
  /** Closes the panel; navigation asks first when there are unsaved changes. */
  onClose: () => void;
};

/** A time off type's panel over Settings › Time off. */
export function TimeOffTypePanel({ timeOffTypeId, policyId, onClose }: Props) {
  const { data, error, loading, refetch } = useQuery(TimeOffTypePanelDocument, {
    variables: { id: timeOffTypeId },
    // The draft starts from what this load returns, so it must be current, not a cached copy.
    fetchPolicy: "network-only",
  });
  const type = data?.timeOffSettings.timeOffType;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined} className="max-w-[72rem]">
        {type ? (
          <TimeOffTypeEditor
            key={type.timeOffType.id}
            type={type}
            focusPolicyId={policyId}
            onClose={onClose}
          />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                {loading ? <Skeleton className="h-6 w-48" /> : null}
                {!loading &&
                  t(error ? "settings.timeOffType.loadFailed" : "settings.timeOffType.notFound")}
              </SheetTitle>
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("settings.timeOffType.close")}
                  />
                }
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
                {t("settings.email.retry")}
              </Button>
            )}
            {loading && <Skeleton className="h-40 w-full" />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
