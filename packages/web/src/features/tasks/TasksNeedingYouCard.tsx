import { useQuery } from "@apollo/client/react";
import { CheckSquare } from "@phosphor-icons/react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useRef } from "react";

import { MyTasksDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { TaskAction } from "./TaskAction";
import { dueText, isLate, needsYou, taskFact } from "./taskText";

type Props = {
  /** The calendar day the page shows, so a task's lateness agrees with it. */
  today: string;
};

/** The first tasks the signed-in person holds to do, by due date as on Tasks, each with its next step. */
export function TasksNeedingYouCard({ today }: Props) {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const viewerId = me.employee?.id ?? null;
  const { data, error, refetch } = useQuery(MyTasksDocument, { fetchPolicy: "cache-and-network" });
  const seeAll = useRef<HTMLAnchorElement>(null);
  const tasks = data?.myTasks.needsYou.filter((task) => needsYou(task, viewerId)) ?? [];

  return (
    <Card
      title={t("tasks.group.needsYou")}
      action={
        <Link ref={seeAll} to="/tasks" className="text-sm font-medium hover:underline">
          {t("tasks.seeYours")}
        </Link>
      }
    >
      {error && !data ? (
        <p className="text-sm text-muted-foreground">
          {t("tasks.loadFailed")}{" "}
          <Button variant="link" className="h-auto p-0" onClick={() => void refetch()}>
            {t("tasks.retry")}
          </Button>
        </p>
      ) : (
        data &&
        (tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("tasks.summary.none")}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-border/60 border-t border-border/60">
            {tasks.slice(0, SHOWN).map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-5 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/75">
                  <CheckSquare size={16} aria-hidden />
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <Link
                    to="/tasks/$taskId"
                    params={{ taskId: task.id }}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {task.title}
                  </Link>
                  {taskFact(task, viewerId) && (
                    <span className="truncate text-xs text-muted-foreground">
                      {taskFact(task, viewerId)}
                    </span>
                  )}
                  {task.dueDate && (
                    <span
                      className={cn(
                        "text-xs text-muted-foreground",
                        isLate(task, today) && "font-medium text-amber-700",
                      )}
                    >
                      {dueText(task, today)}
                    </span>
                  )}
                </div>
                <TaskAction
                  task={task}
                  // A done task leaves this list with its button; focus moves on instead of to the page's start.
                  onDone={() => {
                    if (document.activeElement === document.body) seeAll.current?.focus();
                  }}
                />
              </li>
            ))}
          </ul>
        ))
      )}
    </Card>
  );
}

/** Today lists a few; Tasks has them all. */
const SHOWN = 5;
