import { useMutation, useQuery } from "@apollo/client/react";
import { useRouter, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { ImportStepDocument, SkipImportDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";

import { SlackSourceRow } from "./SlackSourceRow";

const SLACK_ERROR_MESSAGES = {
  cancelled: "imports.slack.cancelled",
  state: "imports.slack.state",
  failed: "imports.slack.failed",
} as const;

/**
 * The import step of setup: the sources people come from. Skipping leaves the step;
 * the router then reloads and routing sends the owner on into the app.
 */
export function ImportStep() {
  const router = useRouter();
  const { slackError } = useSearch({ from: "/setup/import" });
  const { data, error, refetch } = useQuery(ImportStepDocument);
  const [skipImport, { loading: skipping }] = useMutation(SkipImportDocument);
  const [skipFailed, setSkipFailed] = useState(false);

  const skip = async () => {
    setSkipFailed(false);
    try {
      await skipImport();
    } catch {
      setSkipFailed(true);
      return;
    }
    await router.invalidate();
  };

  return (
    <SetupStepForm
      onSubmit={() => void skip()}
      footer={
        <Button type="submit" variant="outline" size="lg" className="h-10 px-4" disabled={skipping}>
          {t(skipping ? "setup.import.skipping" : "setup.import.skip")}
        </Button>
      }
    >
      {slackError && (
        <p role="alert" className="text-sm text-destructive">
          {t(SLACK_ERROR_MESSAGES[slackError])}
        </p>
      )}
      {data ? (
        <SlackSourceRow
          source={data.import.sources.find(({ kind }) => kind === "SLACK")}
          canConnect={data.import.canConnectSlack}
        />
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("imports.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("imports.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[66px] rounded-xl" />
      )}
      {skipFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.import.skipFailed")}
        </p>
      )}
    </SetupStepForm>
  );
}
