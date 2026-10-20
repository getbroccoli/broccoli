import { useQuery } from "@apollo/client/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Link, useRouteContext, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ImportStepDocument } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentStatus } from "@/features/externalAgents";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { uploadFile, uploadFileForAgent } from "./fileApi";
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
  const ai = data?.setup.ai;
  const agentChosen = ai?.source === "AGENT";
  // The way of the connected agent, else of the prompt waiting for one; set on Setup AI.
  const agentWay = ai?.agent?.way ?? ai?.agentCode?.way;
  // Files are read in the background, and the owner's agent connects and sends them from
  // outside the page: poll while either may happen.
  useEffect(() => {
    if (!mapping && !agentChosen) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [mapping, agentChosen, startPolling, stopPolling]);
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
            <Button
              type="button"
              variant="outline"
              size="lg"
              // The title shows on hover only when the disabled button takes pointer events.
              className="h-10 px-4 disabled:pointer-events-auto"
              // Until the import loads, it may already hold people.
              disabled={starting || gathering || !data}
              title={gathering ? t("setup.import.demoUnavailable") : undefined}
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
          {ai && agentChosen && <AgentStatus ai={ai} />}
          <SlackSourceRow connection={data.slackConnection} source={slackSource} />
          <FileSources
            sources={fileSources}
            onUploaded={() => refetch()}
            onUploadingChange={setUploading}
            uploadFile={agentChosen ? uploadFileForAgent : uploadFile}
            canDrop={agentWay !== "PARSES_ORIGINAL_FILES"}
            agentChosen={agentChosen}
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
