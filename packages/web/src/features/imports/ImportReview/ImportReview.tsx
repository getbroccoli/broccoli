import { useMutation, useQuery } from "@apollo/client/react";
import { MagnifyingGlass, UserCircle, WarningCircle } from "@phosphor-icons/react";
import { Link, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { ApproveImportDocument, ImportReviewDocument } from "@/__generated__/graphql";
import { DataTable, TableSearchField, TableState } from "@/components/dataTable";
import { Button, buttonVariants } from "@/components/ui/button";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { useListPage } from "@/lib/listPage";

import { IMPORT_REVIEW_COLUMNS } from "./importReviewColumns";
import {
  type ImportReviewSearch,
  SEARCH_MAX_LENGTH,
  toImportReviewVariables,
} from "./importReviewSearch";
import { SourceChips } from "./SourceChips";

const POLL_INTERVAL_MS = 2_000;

/**
 * The setup review step: everyone the import found, read-only, and Approve. Approve
 * adds the ready people; the router then reloads and routing sends the owner on.
 */
export function ImportReview() {
  const router = useRouter();
  const search = useSearch({ from: "/setup/import_/review" });
  const navigate = useNavigate({ from: "/setup/import/review" });
  const writeSearch = useCallback(
    (patch: Partial<ImportReviewSearch>, replace: boolean) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  const { data, previousData, error, loading, refetch, startPolling, stopPolling } = useQuery(
    ImportReviewDocument,
    { variables: toImportReviewVariables(search) },
  );
  const list = useListPage({
    search,
    writeSearch,
    current: data?.import.employees,
    previous: previousData?.import.employees,
    error,
  });
  const sources = (data ?? previousData)?.import.sources ?? [];
  const reading = sources.some(({ status }) => status === "MAPPING");
  // A file may still be read, such as after a Retry in another tab: poll until it is.
  useEffect(() => {
    if (!reading) {
      return;
    }
    startPolling(POLL_INTERVAL_MS);
    return stopPolling;
  }, [reading, startPolling, stopPolling]);
  const [approveImport, { loading: approving }] = useMutation(ApproveImportDocument);
  const [approveFailed, setApproveFailed] = useState(false);
  const readyCount = (data ?? previousData)?.import.readyEmployeeCount ?? 0;
  const totalCount = sources.reduce((total, { employeeCount }) => total + employeeCount, 0);
  const leftOutCount = totalCount - readyCount;

  const approve = async () => {
    setApproveFailed(false);
    try {
      await approveImport();
    } catch {
      setApproveFailed(true);
      return;
    }
    await router.invalidate();
  };

  return (
    <SetupStepForm
      width="wide"
      onSubmit={() => void approve()}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <Link
            to="/setup/import"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10 px-4")}
            disabled={approving}
          >
            {t("setup.review.back")}
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {data && <ApproveNote readyCount={readyCount} leftOutCount={leftOutCount} />}
            {readyCount > 0 && (
              <Button type="submit" size="lg" className="h-10 px-4" disabled={approving || reading}>
                {approveLabel({ approving, reading, readyCount })}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {sources.some(({ employeeCount }) => employeeCount > 0) && (
        <SourceChips sources={sources.filter(({ employeeCount }) => employeeCount > 0)} />
      )}
      <DataTable
        columns={IMPORT_REVIEW_COLUMNS}
        rows={list.rows}
        getRowId={(person) => person.id}
        sort={list.sort}
        onSortChange={list.changeSort}
        isLoading={loading}
        toolbar={
          <TableSearchField
            query={search.q}
            onQueryChange={list.changeQuery}
            label={t("setup.review.search.label")}
            placeholder={t("setup.review.search.placeholder")}
            maxLength={SEARCH_MAX_LENGTH}
          />
        }
        notice={list.error ? errorNotice() : undefined}
        emptyState={search.q ? noMatches(search.q) : noPeople()}
        pager={list.pager}
      />
      {approveFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.review.approveFailed")}
        </p>
      )}
    </SetupStepForm>
  );

  function noMatches(query: string) {
    return (
      <TableState
        icon={MagnifyingGlass}
        title={t("setup.review.noMatches", { query })}
        action={
          <Button variant="outline" size="sm" onClick={() => list.changeQuery(undefined)}>
            {t("setup.review.clearSearch")}
          </Button>
        }
      />
    );
  }

  function noPeople() {
    return <TableState icon={UserCircle} title={t("setup.review.empty")} />;
  }

  function errorNotice() {
    return (
      <TableState
        isError
        icon={WarningCircle}
        title={t("imports.loadFailed")}
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t("imports.retry")}
          </Button>
        }
      />
    );
  }
}

/** Who Approve leaves out, or that no one is ready; nothing when everyone is. */
function ApproveNote({ readyCount, leftOutCount }: { readyCount: number; leftOutCount: number }) {
  if (readyCount === 0) {
    return <p className="text-sm text-muted-foreground">{t("setup.review.noneReady")}</p>;
  }
  if (leftOutCount === 0) {
    return null;
  }
  return (
    <p className="text-sm text-muted-foreground">
      {leftOutCount === 1
        ? t("setup.review.leftOutOne")
        : t("setup.review.leftOut", { count: String(leftOutCount) })}
    </p>
  );
}

function approveLabel({
  approving,
  reading,
  readyCount,
}: {
  approving: boolean;
  reading: boolean;
  readyCount: number;
}) {
  if (approving) {
    return t("setup.review.approving");
  }
  if (reading) {
    return t("setup.review.reading");
  }
  return readyCount === 1
    ? t("setup.review.approveOne")
    : t("setup.review.approve", { count: String(readyCount) });
}
