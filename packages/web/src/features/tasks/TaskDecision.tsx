import { useState } from "react";

import type { DocumentNode } from "graphql";

import type { TaskResultInput } from "@/__generated__/graphql";

import { TaskResultButtons } from "./TaskResultButtons";
import { TaskResultForm } from "./TaskResultForm";
import type { TaskRow } from "./taskText";
import { useTaskActions } from "./useTaskActions";

type Props = {
  task: { id: string; resultForm: NonNullable<TaskRow["resultForm"]> };
  /** Active queries a decision changes, refetched once it is made, before `onSettled`. */
  refetch: DocumentNode[];
  /**
   * Runs once the decision is made, or refused because the task changed meanwhile; after a failure
   * that may not have reached the API, the form stays, with its comment, to try again.
   */
  onSettled: () => void;
};

/**
 * A task's result form outside its panel, such as Approve and Reject on the time off it asks to
 * decide: buttons or choices, and a comment when the chosen option requires one.
 */
export function TaskDecision({ task, refetch, onSettled }: Props) {
  const actions = useTaskActions({ refetch });
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const form = task.resultForm;
  const finish = (result: TaskResultInput) =>
    void actions.markDone(task.id, result).then((outcome) => outcome !== "FAILED" && onSettled());

  return (
    <div className="flex flex-col gap-3">
      {form.display === "BUTTONS" && (
        <TaskResultButtons
          options={form.options}
          chosenCode={chosenCode}
          isPending={actions.isPending}
          onChoose={(option) =>
            option.commentRequired
              ? setChosenCode(option.code)
              : finish({ code: option.code, comment: null })
          }
        />
      )}
      <TaskResultForm
        form={form}
        chosenCode={chosenCode}
        onChoose={setChosenCode}
        isPending={actions.isPending}
        onSend={finish}
      />
    </div>
  );
}
