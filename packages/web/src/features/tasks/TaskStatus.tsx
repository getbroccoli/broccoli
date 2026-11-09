import type { TaskStatus as Status } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

const TONE_DOT: Record<Status, string> = {
  TO_DO: "bg-amber-500",
  WAITING: "bg-muted-foreground/40",
  DONE: "bg-brand",
  CANCELLED: "bg-muted-foreground/40",
};

type Props = { status: Status };

/** Where a task stands: a dot for its tone, then the status. */
export function TaskStatus({ status }: Props) {
  return (
    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[status])} />
      {t(`tasks.status.${status}`)}
    </span>
  );
}
