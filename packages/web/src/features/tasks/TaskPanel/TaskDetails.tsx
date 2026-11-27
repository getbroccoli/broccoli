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
import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { TASK_DESCRIPTION } from "../taskDescription";
import { TaskStatus } from "../TaskStatus";
import { formatTaskDay, isOpen, personName, resultText, type TaskRow } from "../taskText";
import { useTaskActions } from "../useTaskActions";
import { DeleteTaskDialog } from "./DeleteTaskDialog";
import { PanelCloseButton } from "./PanelCloseButton";
import { TaskResultButtons } from "../TaskResultButtons";
import { TaskProcessRun } from "./TaskProcessRun";
import { TaskResultForm } from "../TaskResultForm";
import { SECTION_LABEL } from "../sectionLabel";

type Props = {
  task: TaskRow;
  /** Closes the panel once the task is deleted. */
  onDeleted: () => void;
};

/** A loaded task: what is asked and by whom on the left, what acting does and where it came from on the right. */
export function TaskDetails({ task, onDeleted }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const viewerId = me.employee?.id ?? null;
  const actions = useTaskActions();
  const [deleting, setDeleting] = useState(false);
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const holds = task.assignee.id === viewerId;
  const asked = task.askedBy?.id === viewerId;
  const canDelete = asked && isOpen(task) && task.type === "MANUAL_TO_DO";
  const canFinish = holds && task.status === "TO_DO";
  const decides = task.processRun?.decidesOutcome ?? false;
  const form = task.resultForm;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-4 border-b border-border px-6 py-5">
        {task.askedBy ? (
          <Avatar
            url={task.askedBy.avatarUrl}
            firstName={task.askedBy.firstName}
            lastName={task.askedBy.lastName}
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
          {task.subject && (
            <p className="truncate text-[13px] text-muted-foreground">
              {t("tasks.panel.about", { name: personName(task.subject) })}
            </p>
          )}
          {/* Clamped so a long comment never pushes the body away; history keeps it whole. */}
          {task.result && (
            <p className="line-clamp-2 text-[13px] break-words">
              {t("tasks.panel.result", { result: resultText(task.result) })}
            </p>
          )}
        </div>
        {canFinish && !form && (
          <Button
            size="sm"
            disabled={actions.isPending}
            onClick={() => void actions.markDone(task.id)}
          >
            {t("tasks.markDone")}
          </Button>
        )}
        {canFinish && form?.display === "BUTTONS" && (
          <TaskResultButtons
            options={form.options}
            chosenCode={chosenCode}
            isPending={actions.isPending}
            onChoose={(option) =>
              option.commentRequired
                ? setChosenCode(option.code)
                : void actions.markDone(task.id, { code: option.code, comment: null })
            }
          />
        )}
        {canDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label={t("tasks.more")} />}
            >
              <DotsThree weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDeleting(true)}>
                {t("tasks.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <PanelCloseButton />
      </header>
      <div className="subtle-scrollbar grid flex-1 content-start gap-8 overflow-y-auto px-6 py-6 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-8">
          <section className="flex flex-col gap-3">
            <h3 className={SECTION_LABEL}>
              {asked
                ? t("tasks.panel.youAsk")
                : task.askedBy
                  ? t("tasks.panel.asks", { name: task.askedBy.firstName })
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
          {canFinish && form && (
            <TaskResultForm
              form={form}
              chosenCode={chosenCode}
              onChoose={setChosenCode}
              isPending={actions.isPending}
              onSend={(result) => void actions.markDone(task.id, result)}
            />
          )}
          <RecordHistory recordType="TASK" recordId={task.id} description={TASK_DESCRIPTION} />
        </div>
        <aside className="flex flex-col gap-6 self-start rounded-xl bg-muted/50 p-4 text-sm">
          {holds && isOpen(task) && (
            <section className="flex flex-col gap-1.5">
              <h3 className={SECTION_LABEL}>
                {t(decides ? "tasks.panel.ifDecide" : "tasks.panel.ifDone")}
              </h3>
              <p>{ifDoneText(task, asked, decides)}</p>
            </section>
          )}
          {hasOrigin(task) && (
            <section className="flex flex-col gap-1.5 text-muted-foreground">
              <h3 className={SECTION_LABEL}>{t("tasks.panel.from")}</h3>
              {task.askedBy && <p>{originLine(task, asked)}</p>}
              {task.status === "DONE" && (
                <p>
                  {task.doneBy?.id === viewerId
                    ? t("tasks.panel.doneByYou", { date: formatTaskDay(task.doneAt!) })
                    : t("tasks.panel.doneBy", {
                        name: personName(task.doneBy),
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
          )}
          {task.processRun && <TaskProcessRun task={task} viewerId={viewerId} />}
        </aside>
      </div>
      <DeleteTaskDialog
        open={deleting}
        onOpenChange={setDeleting}
        assigneeName={task.assignee.firstName}
        isPending={actions.isPending}
        onDelete={async () => {
          const deleted = await actions.delete(task.id);
          if (deleted) onDeleted();
          return deleted;
        }}
      />
    </div>
  );
}

/** Who learns of it once done: the asker, who sees a decision with its comment, or nobody. */
function ifDoneText(task: TaskRow, asked: boolean, decides: boolean): string {
  if (!task.askedBy || asked) return t("tasks.panel.ifDoneNobody");
  const name = task.askedBy.firstName;
  return t(decides ? "tasks.panel.ifDecideAsker" : "tasks.panel.ifDoneAsker", { name });
}

/** Who asked, or how it ended; a process's task names its process in its own section instead. */
function hasOrigin(task: TaskRow): boolean {
  return Boolean(task.askedBy) || task.status !== "TO_DO";
}

/** Who asked for the task, which has someone who asked. */
function originLine(task: TaskRow, asked: boolean): string {
  const date = formatTaskDay(task.createdAt);
  if (asked) return t("tasks.panel.youAsked", { name: task.assignee.firstName, date });
  return t("tasks.panel.askedBy", { name: personName(task.askedBy), date });
}
