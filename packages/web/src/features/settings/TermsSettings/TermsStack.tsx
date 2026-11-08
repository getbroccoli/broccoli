import { useQuery } from "@apollo/client/react";
import { X } from "@phosphor-icons/react";

import { EmploymentTermsStackDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { TermsRecord } from "./TermsRecord";

type Props = {
  termsId: string;
  onClose: () => void;
};

/** One set of terms over the list: what its people work and get, read-only, with its history. */
export function TermsStack({ termsId, onClose }: Props) {
  // Types added in Settings › Time off join every terms, so a stack reloads whenever shown.
  const { data, error, loading, refetch } = useQuery(EmploymentTermsStackDocument, {
    variables: { id: termsId },
    fetchPolicy: "cache-and-network",
  });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      {/* Full screen on a phone, as the person's panel is inset everywhere. */}
      <SheetContent
        aria-describedby={undefined}
        className="max-md:inset-0 max-md:w-full max-md:rounded-none max-md:border-0"
      >
        {data?.terms ? (
          <TermsRecord terms={data.terms} />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-base">
                {loading ? <Skeleton className="h-6 w-48" /> : null}
                {!loading && t(error ? "terms.loadFailed" : "terms.notFound")}
              </SheetTitle>
              <SheetClose
                render={<Button variant="ghost" size="icon" aria-label={t("terms.close")} />}
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
                {t("terms.retry")}
              </Button>
            )}
            {loading && <Skeleton className="h-40 w-full" />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
