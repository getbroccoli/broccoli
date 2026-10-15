import { DotsThree, FileCsv } from "@phosphor-icons/react";

import type { ImportSourceFailure, ImportStepQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

const FAILURE_MESSAGES = {
  NO_HEADER: "imports.files.noHeader",
  NO_PEOPLE_COLUMNS: "imports.files.noPeopleColumns",
  UNAVAILABLE: "imports.files.unavailable",
} as const satisfies Record<ImportSourceFailure, string>;

interface FileSourceCardProps {
  source: ImportStepQuery["import"]["sources"][number];
  /** While another change to the files runs. */
  busy: boolean;
  onRetry: () => void;
  onRemove: () => void;
}

/** One uploaded file: its name and how reading it went. */
export function FileSourceCard({ source, busy, onRetry, onRemove }: FileSourceCardProps) {
  const failed = source.status === "FAILED";
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
      <FileCsv size={22} weight="duotone" aria-hidden className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium" title={source.name}>
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={busy}
              aria-label={t("imports.files.options", { name: source.name })}
            />
          }
        >
          <DotsThree size={22} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onRemove}>
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
  employeeCount,
}: FileSourceCardProps["source"]): string {
  if (status === "MAPPING") {
    return t("imports.files.mapping");
  }
  if (status === "FAILED") {
    return t(failure ? FAILURE_MESSAGES[failure] : "imports.files.unavailable");
  }
  return employeeCount === 1
    ? t("imports.files.onePerson")
    : t("imports.files.people", { count: String(employeeCount) });
}
