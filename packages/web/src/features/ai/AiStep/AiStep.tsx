import { useQuery } from "@apollo/client/react";

import { AiStepDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";

import { AiForm } from "./AiForm";
import { NextButton } from "./NextButton";

/** The Setup AI step: how Broccoli reads the owner's files, or demo data instead. */
export function AiStep() {
  const { data, error, refetch } = useQuery(AiStepDocument);
  const ai = data?.setup.ai;

  if (ai) {
    return <AiForm ai={ai} />;
  }
  return (
    <SetupStepForm onSubmit={() => {}} footer={<NextButton checking={false} disabled />}>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("setup.ai.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("setup.ai.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[280px] rounded-xl" />
      )}
    </SetupStepForm>
  );
}
