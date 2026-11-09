import { CheckSquare, DotsThree } from "@phosphor-icons/react";
import { useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetTitle } from "@/components/ui/sheet";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";

import { TaskStatus } from "../TaskStatus";
import { formatTaskDay, isOpen, personName, taskSource, type TaskRow } from "../taskText";
import { useTaskActions } from "../useTaskActions";
import { CancelTaskDialog } from "./CancelTaskDialog";
import { PanelCloseButton } from "./PanelCloseButton";

type Props = { task: TaskRow };

/** A loaded task: what is asked and by whom on the left, what acting does and where it came from on the right. */
export function TaskDetails({ task }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const viewerId = me.employee?.id ?? null;
  const actions = useTaskActions();
  const [cancelling, setCancelling] = useState(false);
  const holds = task.assignee.id === viewerId;
  const asked = task.requestedBy?.id === viewerId;
  const canReopen = holds && task.status === "DONE";
  const canCancel = asked && isOpen(task);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        {task.requestedBy ? (
          <Avatar
            url={task.requestedBy.avatarUrl}
            firstName={task.requestedBy.firstName}
            lastName={task.requestedBy.lastName}
            className="size-10"
          />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <CheckSquare size={20} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SheetTitle className="text-lg">{task.title}</SheetTitle>
            <TaskStatus status={task.status} />
          </div>
          {task.about && (
            <p className="truncate text-[13px] text-muted-foreground">
              {t("tasks.panel.about", { name: personName(task.about) })}
            </p>
          )}
        </div>
        {holds && task.status === "TO_DO" && (
          <Button
            size="sm"
            disabled={actions.isPending}
            onClick={() => void actions.markDone(task.id)}
          >
            {t("tasks.markDone")}
          </Button>
        )}
        {(canReopen || canCancel) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label={t("tasks.more")} />}
            >
              <DotsThree weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canReopen && (
                <DropdownMenuItem onClick={() => void actions.reopen(task.id)}>
                  {t("tasks.reopen")}
                </DropdownMenuItem>
              )}
              {canCancel && (
                <DropdownMenuItem onClick={() => setCancelling(true)}>
                  {t("tasks.cancel")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <PanelCloseButton />
      </header>
      <div className="subtle-scrollbar grid flex-1 content-start gap-8 overflow-y-auto px-6 py-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="flex flex-col gap-3">
          <h3 className={SECTION_LABEL}>
            {asked
              ? t("tasks.panel.youAsk")
              : task.requestedBy
                ? t("tasks.panel.asks", { name: task.requestedBy.firstName })
                : t("tasks.panel.asksProcess")}
          </h3>
          <p className="text-[15px] leading-relaxed whitespace-pre-line">
            {task.description ?? t("tasks.panel.noDescription")}
          </p>
          {task.dueDate && (
            <p className="text-sm text-muted-foreground">
              {t("tasks.panel.due", { date: formatTaskDay(task.dueDate) })}
            </p>
          )}
        </section>
        <aside className="flex flex-col gap-6 self-start rounded-xl bg-muted/50 p-4 text-sm">
          {holds && isOpen(task) && (
            <section className="flex flex-col gap-1.5">
              <h3 className={SECTION_LABEL}>{t("tasks.panel.ifDone")}</h3>
              <p>
                {task.status === "WAITING"
                  ? t("tasks.panel.waitingNote")
                  : task.requestedBy && !asked
                    ? t("tasks.panel.ifDoneAsker", { name: task.requestedBy.firstName })
                    : t("tasks.panel.ifDoneNobody")}
              </p>
            </section>
          )}
          <section className="flex flex-col gap-1.5 text-muted-foreground">
            <h3 className={SECTION_LABEL}>{t("tasks.panel.from")}</h3>
            <p>{originLine(task, asked, viewerId)}</p>
            {task.status === "DONE" && (
              <p>
                {t("tasks.panel.doneBy", {
                  name: task.doneBy?.id === viewerId ? t("tasks.you") : personName(task.doneBy),
                  date: formatTaskDay(task.doneAt!),
                })}
              </p>
            )}
            {task.status === "CANCELLED" && (
              <p>
                {t("tasks.panel.cancelledBy", {
                  date: formatTaskDay(task.cancelledAt!),
                  reason: task.cancelReason!,
                })}
              </p>
            )}
          </section>
        </aside>
      </div>
      <CancelTaskDialog
        open={cancelling}
        onOpenChange={setCancelling}
        holderName={task.assignee.firstName}
        isPending={actions.isPending}
        onCancel={(reason) => actions.cancel(task.id, reason)}
      />
    </div>
  );
}

function originLine(task: TaskRow, asked: boolean, viewerId: string | null): string {
  const date = formatTaskDay(task.createdAt);
  if (asked) return t("tasks.panel.youAsked", { name: task.assignee.firstName, date });
  if (task.requestedBy)
    return t("tasks.panel.askedBy", { name: personName(task.requestedBy), date });
  return taskSource(task, viewerId);
}

const SECTION_LABEL = "text-[11px] font-medium tracking-wider text-muted-foreground uppercase";
