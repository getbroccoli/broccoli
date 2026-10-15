import { useMutation, useQuery } from "@apollo/client/react";
import { useRouter, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  ApproveImportDocument,
  ImportStepDocument,
  SkipImportDocument,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";

import { FileSources } from "./FileSources";
import { SlackSourceRow } from "./SlackSourceRow";

const SLACK_ERROR_MESSAGES = {
  cancelled: "imports.slack.cancelled",
  state: "imports.slack.state",
  failed: "imports.slack.failed",
} as const;

const POLL_INTERVAL_MS = 2_000;

const LEAVE_FAILURES = {
  approve: "setup.import.approveFailed",
  skip: "setup.import.skipFailed",
} as const;

/**
 * The import step of setup: the sources people come from. Approving turns the
 * imported people into employees; approving or skipping leaves the step, and the
 * router then reloads and routing sends the owner on into the app.
 */
export function ImportStep() {
  const router = useRouter();
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
  const [approveImport, { loading: approving }] = useMutation(ApproveImportDocument);
  const [skipImport, { loading: skipping }] = useMutation(SkipImportDocument);
  const [failure, setFailure] = useState<keyof typeof LEAVE_FAILURES | null>(null);
  const slackSource = sources.find(({ kind }) => kind === "SLACK");
  const fileSources = sources.filter(({ kind }) => kind === "FILE");
  const canApprove = sources.some(({ employeeCount }) => employeeCount > 0);
  const busy = approving || skipping;

  const leave = async (how: keyof typeof LEAVE_FAILURES) => {
    setFailure(null);
    try {
      await (how === "approve" ? approveImport() : skipImport());
    } catch {
      setFailure(how);
      return;
    }
    await router.invalidate();
  };

  return (
    <SetupStepForm
      onSubmit={() => void leave(canApprove ? "approve" : "skip")}
      footer={
        <div className="flex gap-2">
          <Button
            type={canApprove ? "button" : "submit"}
            variant="outline"
            size="lg"
            className="h-10 px-4"
            disabled={busy}
            onClick={canApprove ? () => void leave("skip") : undefined}
          >
            {t(skipping ? "setup.import.skipping" : "setup.import.skip")}
          </Button>
          {canApprove && (
            <Button type="submit" size="lg" className="h-10 px-4" disabled={busy || mapping}>
              {t(approveLabel(approving, mapping))}
            </Button>
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
          {data.import.canReadFiles && (
            <FileSources sources={fileSources} onUploaded={() => refetch()} />
          )}
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
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(LEAVE_FAILURES[failure])}
        </p>
      )}
    </SetupStepForm>
  );
}

function approveLabel(approving: boolean, mapping: boolean) {
  if (approving) {
    return "setup.import.approving";
  }
  return mapping ? "setup.import.reading" : "setup.import.approve";
}
