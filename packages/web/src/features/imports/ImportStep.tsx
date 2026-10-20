import { useQuery } from "@apollo/client/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Link, useRouteContext, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ImportStepDocument } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { FileSources } from "./FileSources";
import { SlackSourceRow } from "./SlackSourceRow";
import { useStartDemo } from "./useStartDemo";

const SLACK_ERROR_MESSAGES = {
  cancelled: "imports.slack.cancelled",
  state: "imports.slack.state",
  failed: "imports.slack.failed",
} as const;

const POLL_INTERVAL_MS = 2_000;

/**
 * The import step of setup: the sources people come from. Review leads to the review,
 * where the owner approves; before any people are gathered, the demo company can replace them.
 */
export function ImportStep() {
  const { slackError } = useSearch({ from: "/setup/import" });
  const { mode } = useRouteContext({ from: "__root__" });
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
  const { start: startDemo, starting, failed: startFailed } = useStartDemo();
  const slackSource = sources.find(({ kind }) => kind === "SLACK");
  const fileSources = sources.filter(({ kind }) => kind === "FILE");
  const canReview = sources.some(({ employeeCount }) => employeeCount > 0);
  const [uploading, setUploading] = useState(false);
  const reading = mapping || uploading;
  const gathering = canReview || reading;

  return (
    <SetupStepForm
      // Enter must not start the demo: only its button does.
      onSubmit={() => {}}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {mode === "SELF_HOSTED" && (
            <Link
              to="/setup/ai"
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-10 gap-2 px-3")}
              disabled={starting}
            >
              <ArrowLeft aria-hidden />
              {t("setup.back")}
            </Link>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            {gathering && (
              <p id="demo-unavailable" className="text-sm text-muted-foreground">
                {t("setup.import.demoUnavailable")}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-10 px-4"
              // Until the import loads, it may already hold people.
              disabled={starting || gathering || !data}
              aria-describedby={gathering ? "demo-unavailable" : undefined}
              onClick={() => void startDemo()}
            >
              {t(starting ? "setup.import.demoStarting" : "setup.import.demo")}
            </Button>
            {gathering && (
              <Link
                to="/setup/import/review"
                disabled={starting || reading}
                aria-disabled={starting || reading}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-10 gap-2 px-4 aria-disabled:pointer-events-none aria-disabled:opacity-50",
                )}
              >
                {t(reading ? "setup.import.reading" : "setup.import.next")}
                <ArrowRight weight="bold" aria-hidden />
              </Link>
            )}
          </div>
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
      {startFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.import.skipFailed")}
        </p>
      )}
    </SetupStepForm>
  );
}
