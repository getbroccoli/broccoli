import { useQuery } from "@apollo/client/react";
import { CheckSquare, ClipboardText, WarningCircle } from "@phosphor-icons/react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";

import { MyTasksDocument, type MyTasksQuery } from "@/__generated__/graphql";
import { DataTable, type DataTableColumn, TableState } from "@/components/dataTable";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";
import { calendarDayOf } from "@/lib/calendarDay";
import { cn } from "@/lib/class-names";

import { TaskStatus } from "./TaskStatus";
import { dueText, isLate, isOpen, taskFact, taskSource, type TaskRow } from "./taskText";
import { useTaskActions } from "./useTaskActions";

type Group = keyof Omit<MyTasksQuery["myTasks"], "__typename">;
type Row = { group: Group; task: TaskRow };

const GROUPS: Group[] = ["needsYou", "waitingOnOthers", "resolvedRecently"];

/** My tasks: one table grouped by where the ball is, each row opening its task. */
export function MyTasks() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const viewerId = me.employee?.id ?? null;
  const navigate = useNavigate();
  const actions = useTaskActions();
  const { data, error, loading, refetch } = useQuery(MyTasksDocument, {
    fetchPolicy: "cache-and-network",
  });
  const today = calendarDayOf(new Date());
  const rows =
    data && GROUPS.flatMap((group) => data.myTasks[group].map((task) => ({ group, task })));

  const columns: DataTableColumn<Row>[] = [
    {
      id: "task",
      header: t("tasks.column.task"),
      className: "min-w-72",
      cell: ({ task }) => (
        <div className="flex items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/75">
            <CheckSquare size={16} aria-hidden />
          </span>
          <div className="grid min-w-0 gap-0.5">
            <Link
              to="/tasks/$taskId"
              params={{ taskId: task.id }}
              className={cn(
                "truncate text-[13.5px] font-medium hover:underline",
                !isOpen(task) && "text-muted-foreground",
              )}
            >
              {task.title}
            </Link>
            <span className="truncate text-xs text-muted-foreground">
              {taskFact(task, viewerId)}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: "type",
      header: t("tasks.column.type"),
      cell: ({ task }) => t(`tasks.type.${task.type}`),
    },
    {
      id: "from",
      header: t("tasks.column.from"),
      cell: ({ task }) => (
        <span className="flex items-center gap-2">
          {task.askedBy && (
            <Avatar
              url={task.askedBy.avatarUrl}
              firstName={task.askedBy.firstName}
              lastName={task.askedBy.lastName}
              className="size-6"
            />
          )}
          <span className="truncate">{taskSource(task, viewerId)}</span>
        </span>
      ),
    },
    {
      id: "due",
      header: t("tasks.column.due"),
      cell: ({ task }) =>
        task.dueDate && (
          <span className={cn("tabular-nums", isLate(task, today) && "font-medium text-amber-700")}>
            {dueText(task, today)}
          </span>
        ),
    },
    {
      id: "where",
      header: t("tasks.column.where"),
      cell: ({ task }) => <TaskStatus status={task.status} />,
    },
    {
      id: "act",
      header: "",
      className: "w-28 text-right",
      cell: ({ task }) =>
        task.status === "TO_DO" &&
        task.assignee.id === viewerId && (
          <Button
            size="xs"
            variant="outline"
            disabled={actions.isPending}
            onClick={() => void actions.markDone(task.id)}
          >
            {t("tasks.markDone")}
          </Button>
        ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={({ task }) => task.id}
      groupOf={({ group }) => t(`tasks.group.${group}`)}
      sort={NO_SORT}
      onSortChange={() => {}}
      density="comfortable"
      isLoading={loading && Boolean(data)}
      onRowClick={({ task }) =>
        void navigate({ to: "/tasks/$taskId", params: { taskId: task.id } })
      }
      emptyState={<TableState icon={ClipboardText} title={t("tasks.empty")} />}
      notice={
        error && !data ? (
          <TableState
            icon={WarningCircle}
            isError
            title={t("tasks.loadFailed")}
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                {t("tasks.retry")}
              </Button>
            }
          />
        ) : undefined
      }
    />
  );
}

const NO_SORT = { key: "task", direction: "asc" } as const;
