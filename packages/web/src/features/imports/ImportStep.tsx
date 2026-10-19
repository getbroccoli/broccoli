import { useQuery } from "@apollo/client/react";
import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ImportStepDocument } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { FileSources } from "./FileSources";
import { SlackSourceRow } from "./SlackSourceRow";
import { useSkipWithDemoData } from "./useSkipWithDemoData";

const SLACK_ERROR_MESSAGES = {
  cancelled: "imports.slack.cancelled",
  state: "imports.slack.state",
  failed: "imports.slack.failed",
} as const;

const POLL_INTERVAL_MS = 2_000;

/**
 * The import step of setup: the sources people come from. Next leads to the review,
 * where the owner approves; skipping leaves the step with the demo company instead.
 */
export function ImportStep() {
  const { slackError } = useSearch({ from: "/setup/import" });
  const { data, error, refetch, startPolling, stopPolling } = useQuery(ImportStepDocument);
  const sources = data?.import.sources ?? [];
  const mapping = sources.some(({ status }) => status === "MAPPING");
  // Files are read in the background: poll while one is.
  useEffect(() => {
    if (!mapping) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [mapping, startPolling, stopPolling]);
  const { skip, skipping, failed: skipFailed } = useSkipWithDemoData();
  const slackSource = sources.find(({ kind }) => kind === "SLACK");
  const fileSources = sources.filter(({ kind }) => kind === "FILE");
  const canReview = sources.some(({ employeeCount }) => employeeCount > 0);
  const [uploading, setUploading] = useState(false);
  const reading = mapping || uploading;

  return (
    <SetupStepForm
      onSubmit={() => void skip()}
      footer={
        <div className="flex gap-2">
          <Button
            type="submit"
            variant="outline"
            size="lg"
            className="h-10 px-4"
            disabled={skipping}
          >
            {t(skipping ? "setup.import.skipping" : "setup.import.skip")}
          </Button>
          {(canReview || reading) && (
            <Link
              to="/setup/import/review"
              disabled={skipping || reading}
              aria-disabled={skipping || reading}
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-10 px-4 aria-disabled:pointer-events-none aria-disabled:opacity-50",
              )}
            >
              {t(reading ? "setup.import.reading" : "setup.import.next")}
            </Link>
          )}
        </div>
      }
    >
      {slackError && (
        <p role="alert" className="text-sm text-destructive">
          {t(SLACK_ERROR_MESSAGES[slackError])}
        </p>
      )}
      {data ? (
        <>
          <SlackSourceRow connection={data.slackConnection} source={slackSource} />
          <FileSources
            sources={fileSources}
            onUploaded={() => refetch()}
            onUploadingChange={setUploading}
          />
        </>
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
