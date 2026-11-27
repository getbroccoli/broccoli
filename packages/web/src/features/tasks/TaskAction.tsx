import { Link } from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";

import type { TaskRow } from "./taskText";
import { useTaskActions } from "./useTaskActions";

type Props = {
  task: TaskRow;
  /** Runs once Mark done ends, as the task may then leave the list holding focus. */
  onDone?: () => void;
};

/** The next step on a task the viewer holds: Answer in its panel when it asks for a result, else Mark done. */
export function TaskAction({ task, onDone }: Props) {
  const actions = useTaskActions();
  // A task that asks for a result is answered in its panel, not with one click.
  return task.resultForm ? (
    <Link
      to="/tasks/$taskId"
      params={{ taskId: task.id }}
      className={buttonVariants({ size: "xs", variant: "outline" })}
    >
      {t("tasks.answer")}
    </Link>
  ) : (
    <Button
      size="xs"
      variant="outline"
      disabled={actions.isPending}
      onClick={() => void actions.markDone(task.id).then(onDone)}
    >
      {t("tasks.markDone")}
    </Button>
  );
}
