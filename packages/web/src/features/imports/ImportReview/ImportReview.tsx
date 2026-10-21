import { useQuery } from "@apollo/client/react";
import {
  ArrowLeft,
  ArrowRight,
  MagnifyingGlass,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  ApproveImportDocument,
  type ImportCheckKind,
  ImportReviewDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import {
  DataTable,
  type DataTablePager,
  TableSearchField,
  TableState,
} from "@/components/dataTable";
import { Button, buttonVariants } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { SetupStepForm, useSetupPages } from "@/features/setup";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";
import { SEARCH_MAX_LENGTH, useListPage } from "@/lib/listPage";
import { useRouteAction } from "@/lib/useRouteAction";

import { IMPORT_REVIEW_COLUMNS, useImportReviewRows } from "./importReviewColumns";
import { type ImportReviewSearch, toImportReviewVariables } from "./importReviewSearch";
import { ApproveNote } from "./ApproveNote";
import { CheckFilterLine } from "./CheckFilterLine";
import { SourceChips } from "./SourceChips";
import { ThingsToCheck } from "./ThingsToCheck";

/**
 * The setup review step: one row per import employee, where the owner settles what the
 * sources disagree on, fixes values and leaves people out, then approves. Approve adds
 * the ready ones; the router then reloads and routing sends the owner on.
 */
export function ImportReview() {
  const search = useSearch({ from: "/setup/import_/review" });
  const navigate = useNavigate({ from: "/setup/import/review" });
  const writeSearch = useCallback(
    (patch: Partial<ImportReviewSearch>, replace: boolean) =>
      void navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  const { data, previousData, error, loading, refetch } = useQuery(
    ImportReviewDocument,
    // Sources change on the import page: show the cache, then refresh it on entry.
    { variables: toImportReviewVariables(search), fetchPolicy: "cache-and-network" },
  );
  const list = useListPage({
    search,
    writeSearch,
    current: data?.import.employees,
    previous: previousData?.import.employees,
    error,
  });
  const rows = useImportReviewRows(list.rows);
  const sources = (data ?? previousData)?.import.sources ?? [];
  const [approveImport, { error: approveError, payloadError: approveConflict }] =
    usePayloadMutation(ApproveImportDocument);
  const [run, approving] = useRouteAction();
  const { previous } = useSetupPages("review");
  const current = (data ?? previousData)?.import;
  const reading = current?.reading ?? false;
  const readyCount = current?.readyEmployeeCount ?? 0;
  const totalCount = current?.employeeCount ?? 0;
  const checks = current?.checks ?? [];
  const peopleSources = sources.filter(({ employeeCount }) => employeeCount > 0);
  const incompleteCount = countOf(checks, "INCOMPLETE");
  const uncheckedCount = countOf(checks, "CONFLICT");
  const leftOutCount = totalCount - readyCount - incompleteCount;

  // `approveError` or `approveConflict` shows a failure; a conflict means the people changed.
  const approve = () =>
    run(async () => {
      if (!current) {
        return false;
      }
      try {
        // The version of what this page shows: people added meanwhile, such as by the owner's
        // agent, refuse Approve until the page shows them.
        await approveImport({ variables: { version: current.version } });
      } catch (failure) {
        void refetch();
        throw failure;
      }
    });

  return (
    <SetupStepForm
      width="wide"
      // Enter in the search must not approve: only the Approve button does.
      onSubmit={() => {}}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {previous && (
            <Link
              to={previous}
              className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "h-10 gap-2 px-3")}
              disabled={approving}
            >
              <ArrowLeft aria-hidden />
              {t("setup.back")}
            </Link>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {data && (
              <ApproveNote
                readyCount={readyCount}
                leftOutCount={leftOutCount}
                incompleteCount={incompleteCount}
                uncheckedCount={uncheckedCount}
              />
            )}
            {readyCount > 0 && (
              <Button
                type="button"
                size="lg"
                className="h-10 gap-2 px-4"
                // Only what the owner sees now: not while the review refreshes or failed to.
                disabled={approving || reading || loading || Boolean(error)}
                onClick={approve}
              >
                {approveLabel({ approving, reading, readyCount })}
                <ArrowRight weight="bold" aria-hidden />
              </Button>
            )}
          </div>
        </div>
      }
    >
      <Toaster position="top-center" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {peopleSources.length > 0 && <SourceChips sources={peopleSources} />}
          <ThingsToCheck
            checks={checks}
            onShow={(check) => writeSearch({ check, after: undefined }, false)}
          />
        </div>
        <TableSearchField
          query={search.q}
          onQueryChange={list.changeQuery}
          label={t("setup.review.search.label")}
          placeholder={t("setup.review.search.placeholder")}
          maxLength={SEARCH_MAX_LENGTH}
        />
      </div>
      {search.check && (
        <CheckFilterLine
          checkId={search.check}
          open={checks.some(({ id }) => id === search.check)}
          onShowEveryone={() => writeSearch({ check: undefined, after: undefined }, false)}
        />
      )}
      <DataTable
        columns={IMPORT_REVIEW_COLUMNS}
        rows={rows}
        getRowId={(person) => person.id}
        sort={list.sort}
        onSortChange={list.changeSort}
        isLoading={loading}
        notice={list.error ? errorNotice() : undefined}
        emptyState={search.q ? noMatches(search.q) : noPeople()}
        pager={list.pager}
        density="comfortable"
        summary={peopleCount(totalCount, search.q ? list.rows : undefined, list.pager)}
      />
      {(approveError || approveConflict) && (
        <p role="alert" className="text-sm text-destructive">
          {t(approveConflict ? "setup.review.peopleChanged" : "setup.review.approveFailed")}
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

function countOf(
  checks: { kind: ImportCheckKind; count: number }[],
  kind: ImportCheckKind,
): number {
  return checks.filter((check) => check.kind === kind).reduce((sum, { count }) => sum + count, 0);
}

/** "60 people", or "Showing 6 of 60 people" for a search whose matches fit on one page. */
function peopleCount(
  total: number,
  matches: unknown[] | undefined,
  pager: DataTablePager | undefined,
): string {
  const people =
    total === 1 ? t("setup.review.countOne") : t("setup.review.count", { count: String(total) });
  if (!matches || pager?.hasNextPage || pager?.isFirstPage === false) {
    return people;
  }
  return t("setup.review.showing", { count: String(matches.length), people });
}
