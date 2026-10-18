import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { CheckCircle, DotsThree, FileCsv, FileXls } from "@phosphor-icons/react";

import {
  FileSourceCard_SourceFragmentDoc,
  type FileSourceCard_SourceFragment,
  type ImportSourceFailure,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

const FAILURE_MESSAGES = {
  NO_PEOPLE_COLUMNS: "imports.files.noPeopleColumns",
  UNAVAILABLE: "imports.files.unavailable",
} as const satisfies Record<ImportSourceFailure, string>;

interface FileSourceCardProps {
  source: FragmentType<FileSourceCard_SourceFragment>;
  /** While another change to the files runs. */
  busy: boolean;
  onRetry: () => void;
  onRemove: () => void;
}

/** One uploaded file: its name and how reading it went; owns the `FileSourceCard_source` fragment. */
export function FileSourceCard({
  source: sourceRef,
  busy,
  onRetry,
  onRemove,
}: FileSourceCardProps) {
  const { data: source, complete } = useFragment({
    fragment: FileSourceCard_SourceFragmentDoc,
    from: sourceRef,
  });
  // The query that listed this file has just written the fragment, so it is complete.
  if (!complete) return null;
  const failed = source.status === "FAILED";
  const FileIcon = source.name.toLowerCase().endsWith(".xlsx") ? FileXls : FileCsv;
  return (
    <li className="flex min-h-[68px] items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
          source.status === "MAPPED"
            ? "bg-brand-soft/70 text-brand-deep"
            : failed
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground",
        )}
      >
        <FileIcon size={22} weight="duotone" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-semibold" title={source.name}>
          {source.name}
        </span>
        <span
          role={source.status === "MAPPING" ? "status" : undefined}
          className={`text-[13px] ${failed ? "text-destructive" : "text-muted-foreground"}`}
        >
          {statusLine(source)}
        </span>
      </div>
      {failed && (
        <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
          {t("imports.files.retry")}
        </Button>
      )}
      {source.status === "MAPPED" && (
        <CheckCircle size={20} weight="fill" aria-hidden className="shrink-0 text-brand" />
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-2 shrink-0 rounded-full"
              disabled={busy}
              aria-label={t("imports.files.options", { name: source.name })}
            />
          }
        >
          <DotsThree weight="bold" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-1.5">
          <DropdownMenuItem className="h-9 px-2.5" variant="destructive" onClick={onRemove}>
            {t("imports.files.remove")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function statusLine({
  status,
  failure,
  failureMessage,
  employeeCount,
}: FileSourceCard_SourceFragment): string {
  if (status === "MAPPING") {
    return t("imports.files.mapping");
  }
  if (status === "FAILED") {
    return failureMessage ?? t(failure ? FAILURE_MESSAGES[failure] : "imports.files.unavailable");
  }
  return employeeCount === 1
    ? t("imports.files.onePerson")
    : t("imports.files.people", { count: String(employeeCount) });
}
