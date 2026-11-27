import {
  EmployeePanelDocument,
  MyTasksDocument,
  TimeOffBookingPreviewDocument,
  WhosOutDocument,
} from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import { DialogFooter } from "@/components/ui/dialog";
import { TaskDecision } from "@/features/tasks";

import { evictWhosOut } from "./cache";
import type { DecisionTask } from "./decisionTaskOf";

type Props = {
  employeeId: string;
  task: DecisionTask;
  /** Closes the booking card once the decision is made or refused. */
  onClose: () => void;
};

/** The approver's Approve and Reject on a request's booking card, in place of cancelling it. */
export function BookingDecision({ employeeId, task, onClose }: Props) {
  const cache = useCache();
  return (
    <DialogFooter className="sm:justify-start">
      <TaskDecision
        task={task}
        refetch={DECIDED_REFETCH}
        // Also after a refusal: someone decided or withdrew it first, so the month reloads.
        onSettled={() => {
          evictWhosOut(cache, employeeId);
          onClose();
        }}
      />
    </DialogFooter>
  );
}

/** What a decision changes: the month, the person's figures, an open booking's clashes, Tasks. */
const DECIDED_REFETCH = [
  WhosOutDocument,
  EmployeePanelDocument,
  TimeOffBookingPreviewDocument,
  MyTasksDocument,
];
