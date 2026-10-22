import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { CheckCircle, DotsThree, Eye } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import {
  type AiSource,
  FileSourceCard_SourceFragmentDoc,
  type FileSourceCard_SourceFragment,
  type ImportSourceFailure,
} from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type MessageKey, t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { FileIcon } from "../FileIcon";

const FAILURE_MESSAGES = {
  NO_PEOPLE_COLUMNS: "imports.files.noPeopleColumns",
  UNAVAILABLE: "imports.files.unavailable",
  AI_FREE_PERIOD_USED: "imports.files.aiFreePeriodUsed",
  AI_FREE_PERIOD_OVER: "imports.files.aiFreePeriodOver",
  AI_LIMIT_REACHED: "imports.files.aiLimitReached",
  ORIGINAL_READ_INCOMPLETE: "imports.files.originalReadIncomplete",
} as const satisfies Record<ImportSourceFailure, string>;

/** Broccoli AI's free use is used up: only the owner's own key reads the file. */
const NEEDS_OWN_KEY: ReadonlySet<ImportSourceFailure> = new Set([
  "AI_FREE_PERIOD_USED",
  "AI_FREE_PERIOD_OVER",
  "AI_LIMIT_REACHED",
]);

/** Where a file's personal data goes when the owner lets AI read it in full; null is managed. */
const PROVIDERS = {
  EXTERNAL_AGENT: "imports.files.providerExternalAgent",
  BROCCOLI_AI: "imports.files.providerBroccoliAi",
  OPENROUTER: "imports.files.providerOpenRouter",
} as const satisfies Record<AiSource, MessageKey>;

type Props = {
  source: FragmentType<FileSourceCard_SourceFragment>;
  /** While another change to the files runs. */
  busy: boolean;
  /** The AI files are read with now; null on a managed instance. */
  aiSource: AiSource | null;
  /** Whether the connected external agent listens for files, so a new one counts as picked up. */
  externalAgentListening: boolean;
  onRetry: () => void;
  /** Lets AI read this one file in full. */
  onAllowOriginalRead: () => void;
  onRemove: () => void;
};

/** One uploaded file: its name and how reading it went; owns the `FileSourceCard_source` fragment. */
export function FileSourceCard({
  source: sourceRef,
  busy,
  aiSource,
  externalAgentListening,
  onRetry,
  onAllowOriginalRead,
  onRemove,
}: Props) {
  const { data: source, complete } = useFragment({
    fragment: FileSourceCard_SourceFragmentDoc,
    from: sourceRef,
  });
  // The query that listed this file has just written the fragment, so it is complete.
  if (!complete) return null;
  const failed = source.status === "FAILED";
  const externalAgentChosen = aiSource === "EXTERNAL_AGENT";
  // Retry asks Broccoli's model: again for its own file, instead of the agent for a waiting one.
  const canRetry =
    !source.originalReadAllowed &&
    (source.readBy === "PARSED_BY_BROCCOLI"
      ? failed
      : source.status === "MAPPING" && !externalAgentChosen);
  const needsNewConsent =
    source.status === "MAPPING" &&
    source.originalReadAllowed &&
    source.readBy === "ANSWERED_BY_EXTERNAL_AGENT" &&
    !externalAgentChosen;
  const asksForOriginalRead =
    needsNewConsent || (source.originalReadAllowed ? failed : couldNotMapMasked(source));
  const offersOriginalRead =
    !source.originalReadAllowed && (source.status === "MAPPED" || failed) && !asksForOriginalRead;
  const provider = t(aiSource ? PROVIDERS[aiSource] : "imports.files.providerManaged");
  const pickingUp = !needsNewConsent && isPickingUp(source, externalAgentListening);
  return (
    <li
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border px-4 py-3",
        asksForOriginalRead && failed ? "border-amber-200 bg-amber-50/60" : "border-border bg-card",
      )}
    >
      <div className="flex min-h-[44px] items-center gap-3.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-300",
            source.status === "MAPPED"
              ? "bg-brand-soft/70 text-brand-deep"
              : asksForOriginalRead && failed
                ? "bg-amber-100 text-amber-800"
                : failed
                  ? "bg-destructive/10 text-destructive"
                  : "bg-muted text-muted-foreground",
          )}
        >
          <FileIcon name={source.name} size={22} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold" title={source.name}>
            {source.name}
          </span>
          <span
            role={source.status === "MAPPING" ? "status" : undefined}
            className={cn(
              "text-[13px]",
              asksForOriginalRead && failed
                ? "text-amber-800"
                : failed
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {pickingUp && (
              <span
                aria-hidden
                className="mr-2 inline-block size-3 animate-spin rounded-full border-2 border-border border-t-foreground align-[-1px]"
              />
            )}
            {needsNewConsent
              ? t("imports.files.waitingForOriginalReadConsent")
              : statusLine(source, pickingUp)}
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
          <DropdownMenuContent
            align="end"
            className={cn("p-1.5", offersOriginalRead ? "w-72" : "w-48")}
          >
            {offersOriginalRead && (
              <>
                <DropdownMenuItem
                  className="items-start gap-2.5 px-2.5 py-2"
                  onClick={onAllowOriginalRead}
                >
                  <Eye aria-hidden className="mt-0.5 shrink-0" />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{t("imports.files.readOriginal")}</span>
                    <span className="text-xs leading-normal text-muted-foreground">
                      {t("imports.files.readOriginalHint", { provider })}
                    </span>
                  </span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem className="h-9 px-2.5" variant="destructive" onClick={onRemove}>
              {t("imports.removeSource.open")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {asksForOriginalRead && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:ml-[54px]">
          <p className="min-w-0 flex-1 basis-60 text-[13px] leading-normal text-muted-foreground">
            {t("imports.files.readOriginalConsent", { provider })}
          </p>
          <Button type="button" disabled={busy} onClick={onAllowOriginalRead}>
            {t(
              source.originalReadAllowed && failed
                ? "imports.files.retry"
                : "imports.files.readOriginal",
            )}
          </Button>
        </div>
      )}
    </li>
  );
}

/** A PDF waiting for consent, or a file whose masked rows gave no people. */
function couldNotMapMasked({ status, failure }: FileSourceCard_SourceFragment) {
  return (
    status === "WAITING_FOR_ORIGINAL_READ_CONSENT" ||
    (status === "FAILED" && failure === "NO_PEOPLE_COLUMNS")
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

function statusLine(source: FileSourceCard_SourceFragment, pickingUp: boolean): string {
  const { status, failure, failureMessage, employeeCount, readBy, originalReadAllowed } = source;
  if (status === "WAITING_FOR_ORIGINAL_READ_CONSENT") {
    return t("imports.files.pdfNotMasked");
  }
  if (status === "MAPPING") {
    if (readBy === "PARSED_BY_BROCCOLI") {
      return t(originalReadAllowed ? "imports.files.readingOriginal" : "imports.files.mapping");
    }
    if (!pickingUp) {
      return t("imports.files.waitingForExternalAgent");
    }
    return t(
      originalReadAllowed
        ? "imports.files.readingByExternalAgent"
        : "imports.files.pickingUpByExternalAgent",
    );
  }
  if (status === "FAILED") {
    if (!originalReadAllowed && failure === "NO_PEOPLE_COLUMNS") {
      return t("imports.files.couldNotMapMasked");
    }
    return failureMessage ?? t(failure ? FAILURE_MESSAGES[failure] : "imports.files.unavailable");
  }
  const people =
    employeeCount === 1
      ? t("imports.files.onePerson")
      : t("imports.files.people", { count: String(employeeCount) });
  const reader = readerLabel(source);
  return reader ? `${people} · ${t(reader)}` : people;
}

/** How a mapped file names who read it, when it was not Broccoli's masked mapping. */
function readerLabel({
  readBy,
  originalReadAllowed,
  originalReadAiSource,
}: FileSourceCard_SourceFragment): MessageKey | null {
  const byExternalAgent = readBy === "ANSWERED_BY_EXTERNAL_AGENT";
  if (!originalReadAllowed) {
    return byExternalAgent ? "imports.files.mappedByExternalAgent" : null;
  }
  if (byExternalAgent) {
    return "imports.files.readByExternalAgent";
  }
  if (originalReadAiSource === null) {
    return "imports.files.readByAi";
  }
  return originalReadAiSource === "BROCCOLI_AI"
    ? "imports.files.readByBroccoliAi"
    : "imports.files.readByOpenRouter";
}
