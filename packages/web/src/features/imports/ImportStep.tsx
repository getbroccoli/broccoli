import { useQuery } from "@apollo/client/react";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { ImportStepDocument } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStartDemo } from "@/features/demo";
import {
  ExternalAgentNewFiles,
  ExternalAgentPill,
  ExternalAgentPrompt,
} from "@/features/externalAgents";
import { SetupStepForm, useSetupPages } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { uploadFile, uploadFileForExternalAgent } from "./fileApi";
import { FileSources } from "./FileSources";
import { SlackSourceRow } from "./SlackSourceRow";

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
  const { previous, next } = useSetupPages("import");
  const { data, error, refetch, startPolling, stopPolling } = useQuery(ImportStepDocument);
  const sources = data?.import.sources ?? [];
  const readingFiles = data?.import.reading ?? false;
  const ai = data?.setup.ai;
  const externalAgentChosen = ai?.source === "EXTERNAL_AGENT";
  const externalAgent = ai?.externalAgent;
  // Files are read in the background, and the owner's external agent connects and maps them from
  // outside the page: poll while either may happen.
  useEffect(() => {
    if (!readingFiles && !externalAgentChosen) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [readingFiles, externalAgentChosen, startPolling, stopPolling]);
  const { start: startDemo, starting, failed: startFailed } = useStartDemo();
  const slackSource = sources.find(({ kind }) => kind === "SLACK");
  const fileSources = sources.filter(({ kind }) => kind === "FILE");
  const [uploading, setUploading] = useState(false);
  const reading = readingFiles || uploading;
  // Files the connected external agent has not picked up while it does not listen: it stopped
  // waiting, so the owner nudges it.
  const notPickedUp =
    externalAgent && !externalAgent.listening
      ? fileSources.filter(
          (source) =>
            source.readBy === "ANSWERED_BY_EXTERNAL_AGENT" &&
            source.status === "MAPPING" &&
            !source.pickedUpByExternalAgent,
        )
      : [];
  const gathering = data?.import.demoAvailable === false || uploading;

  return (
    <SetupStepForm
      // Enter must not start the demo: only its button does.
      onSubmit={() => {}}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {previous && (
            <Link
              to={previous}
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
              onClick={startDemo}
            >
              {t(starting ? "setup.import.demoStarting" : "setup.import.demo")}
            </Button>
            {gathering && (
              <Link
                to={next}
                disabled={starting || reading}
                aria-disabled={starting || reading}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-10 gap-2 px-4 aria-disabled:pointer-events-none aria-disabled:opacity-50",
                )}
              >
                {t(
                  notPickedUp.length > 0
                    ? "externalAgents.waitingFooter"
                    : reading
                      ? "setup.import.reading"
                      : "setup.import.next",
                )}
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
            uploadFile={externalAgentChosen ? uploadFileForExternalAgent : uploadFile}
            aiSource={ai?.source ?? null}
            externalAgentListening={externalAgent?.listening ?? false}
            externalAgentPill={externalAgent && <ExternalAgentPill externalAgent={externalAgent} />}
            externalAgentNewFiles={
              notPickedUp.length > 0 && (
                <ExternalAgentNewFiles fileNames={notPickedUp.map(({ name }) => name)} />
              )
            }
            externalAgentPrompt={
              externalAgentChosen && !externalAgent ? <ExternalAgentPrompt /> : undefined
            }
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
