import { useQuery } from "@apollo/client/react";
import { useEffect, useRef } from "react";

import { TaskPanelDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { PanelCloseButton } from "./PanelCloseButton";
import { TaskDetails } from "./TaskDetails";

type Props = { taskId: string; onClose: () => void };

/**
 * One task over My tasks: what is asked and by whom on the left, what marking it done does and
 * where it came from on the right. Only its assignee and the person who asked open it.
 */
export function TaskPanel({ taskId, onClose }: Props) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { data, error, loading, refetch } = useQuery(TaskPanelDocument, {
    variables: { id: taskId },
    // A run moves on as its other tasks are done, which this task's cached copy never sees.
    fetchPolicy: "cache-and-network",
  });
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent aria-describedby={undefined} className={PANEL}>
        {data?.task ? (
          <TaskDetails
            task={data.task}
            onDeleted={() => {
              if (mounted.current) onClose();
            }}
          />
        ) : (
          <div className="flex flex-col gap-4 p-6">
            <div className="flex items-center justify-between gap-4">
              <SheetTitle className="text-base">
                {loading ? (
                  <Skeleton className="h-6 w-48" />
                ) : (
                  t(error ? "tasks.panel.loadFailed" : "tasks.panel.notFound")
                )}
              </SheetTitle>
              <PanelCloseButton />
            </div>
            {!loading && error && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => void refetch()}
              >
                {t("tasks.retry")}
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Full screen on a phone. */
const PANEL = "max-md:inset-0 max-md:w-full max-md:rounded-none max-md:border-0";
