import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { CheckCircle, DotsThree, FileCsv, FileXls } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import {
  FileSourceCard_SourceFragmentDoc,
  type FileSourceCard_SourceFragment,
  type ImportSourceFailure,
  type ImportSourceReader,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type MessageKey, t } from "@/i18n";
import { cn } from "@/lib/class-names";

const FAILURE_MESSAGES = {
  NO_PEOPLE_COLUMNS: "imports.files.noPeopleColumns",
  UNAVAILABLE: "imports.files.unavailable",
  AI_FREE_PERIOD_USED: "imports.files.aiFreePeriodUsed",
  AI_FREE_PERIOD_OVER: "imports.files.aiFreePeriodOver",
  AI_LIMIT_REACHED: "imports.files.aiLimitReached",
} as const satisfies Record<ImportSourceFailure, string>;

/** Broccoli AI's free use is used up: only the owner's own key reads the file. */
const NEEDS_OWN_KEY: ReadonlySet<ImportSourceFailure> = new Set([
  "AI_FREE_PERIOD_USED",
  "AI_FREE_PERIOD_OVER",
  "AI_LIMIT_REACHED",
]);

type Props = {
  source: FragmentType<FileSourceCard_SourceFragment>;
  /** While another change to the files runs. */
  busy: boolean;
  /** Whether the owner's external agent maps the files; else a file still waiting for it can go to Broccoli. */
  externalAgentChosen: boolean;
  /** Whether the connected external agent listens for files, so a new one counts as picked up. */
  externalAgentListening: boolean;
  onRetry: () => void;
  onRemove: () => void;
};

/** One uploaded file: its name and how reading it went; owns the `FileSourceCard_source` fragment. */
export function FileSourceCard({
  source: sourceRef,
  busy,
  externalAgentChosen,
  externalAgentListening,
  onRetry,
  onRemove,
}: Props) {
  const { data: source, complete } = useFragment({
    fragment: FileSourceCard_SourceFragmentDoc,
    from: sourceRef,
  });
  // The query that listed this file has just written the fragment, so it is complete.
  if (!complete) return null;
  const failed = source.status === "FAILED";
  // Retry asks Broccoli's model: again for its own file, instead of the agent for a waiting one.
  const canRetry =
    source.readBy === "PARSED_BY_BROCCOLI"
      ? failed
      : source.readBy === "ANSWERED_BY_EXTERNAL_AGENT" &&
        source.status === "MAPPING" &&
        !externalAgentChosen;
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
          {isPickingUp(source, externalAgentListening) && (
            <span
              aria-hidden
              className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-border border-t-foreground align-[-1px]"
            />
          )}
          {statusLine(source, isPickingUp(source, externalAgentListening))}
        </span>
        {source.failure && NEEDS_OWN_KEY.has(source.failure) && (
          <Link
            to="/setup/ai"
            className="w-fit text-[13px] font-medium text-foreground underline underline-offset-2"
          >
            {t("imports.files.useOwnKey")}
          </Link>
        )}
      </div>
      {canRetry && (
        <Button type="button" variant="outline" disabled={busy} onClick={onRetry}>
          {t(failed ? "imports.files.retry" : "imports.files.readWithBroccoli")}
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

/** Whether the external agent picked the file up, or listens and so picks it up in a moment. */
function isPickingUp(
  { status, readBy, pickedUpByExternalAgent }: FileSourceCard_SourceFragment,
  externalAgentListening: boolean,
) {
  return (
    status === "MAPPING" &&
    readBy === "ANSWERED_BY_EXTERNAL_AGENT" &&
    (pickedUpByExternalAgent || externalAgentListening)
  );
}

function statusLine(
  { status, failure, failureMessage, employeeCount, readBy }: FileSourceCard_SourceFragment,
  pickingUp: boolean,
): string {
  if (status === "MAPPING") {
    if (readBy === "PARSED_BY_BROCCOLI") {
      return t("imports.files.mapping");
    }
    return t(
      pickingUp
        ? "imports.files.pickingUpByExternalAgent"
        : "imports.files.waitingForExternalAgent",
    );
  }
  if (status === "FAILED") {
    return failureMessage ?? t(failure ? FAILURE_MESSAGES[failure] : "imports.files.unavailable");
  }
  const people =
    employeeCount === 1
      ? t("imports.files.onePerson")
      : t("imports.files.people", { count: String(employeeCount) });
  return READ_BY_EXTERNAL_AGENT[readBy]
    ? `${people} · ${t(READ_BY_EXTERNAL_AGENT[readBy])}`
    : people;
}

/** How a mapped file names the external agent that mapped it. */
const READ_BY_EXTERNAL_AGENT = {
  PARSED_BY_BROCCOLI: null,
  ANSWERED_BY_EXTERNAL_AGENT: "imports.files.mappedByExternalAgent",
} as const satisfies Record<ImportSourceReader, MessageKey | null>;
