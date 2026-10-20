import { useQuery } from "@apollo/client/react";

import { AiStepDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";

import { AiFooter } from "./AiFooter";
import { AiForm } from "./AiForm";

/** The Setup AI step: how Broccoli reads the owner's files, or demo data instead. */
export function AiStep() {
  // Back from Gather: refresh, as the people gathered there decide whether demo data is offered.
  const { data, error, refetch } = useQuery(AiStepDocument, { fetchPolicy: "cache-and-network" });
  const ai = data?.setup.ai;

  if (ai) {
    // A file still being read may gather people, so it counts too.
    const peopleGathered = data.import.sources.some(
      ({ employeeCount, status }) => employeeCount > 0 || status === "MAPPING",
    );
    return <AiForm ai={ai} peopleGathered={peopleGathered} />;
  }
  return (
    <SetupStepForm onSubmit={() => {}} footer={<AiFooter checking={null} disabled busy={false} />}>
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
