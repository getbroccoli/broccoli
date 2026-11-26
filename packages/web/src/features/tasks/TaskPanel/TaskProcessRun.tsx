import type { ProcessRunStatus } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { processRunDetail, type TaskRow } from "../taskText";

const TONE_DOT: Record<ProcessRunStatus, string> = {
  IN_PROGRESS: "bg-amber-500",
  FINISHED: "bg-brand",
  CANCELLED: "bg-muted-foreground/40",
};

type Props = {
  /** A task a process created, so it has a run. */
  task: TaskRow;
  viewerId: string | null;
};

/** The run of the process that created a task: its name, where it stands or its outcome, and who decided. */
export function TaskProcessRun({ task, viewerId }: Props) {
  const run = task.processRun!;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className={SECTION_LABEL}>{t("tasks.panel.process")}</h3>
      <p>{run.processName}</p>
      <p className="line-clamp-4 break-words">
        <span
          aria-hidden
          className={cn(
            "mr-1.5 inline-block size-2 rounded-full align-middle",
            TONE_DOT[run.status],
          )}
        />
        {run.outcome ? (
          <>
            <b className="font-semibold">{run.outcome.label}</b>
            {run.outcome.comment && ` — ${run.outcome.comment}`}
          </>
        ) : (
          t(`tasks.processRun.${run.status}`)
        )}
      </p>
      <p className="text-muted-foreground">{processRunDetail(task, viewerId)}</p>
    </section>
  );
}

const SECTION_LABEL = "text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
