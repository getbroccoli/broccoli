import { useState } from "react";

import type { DocumentNode } from "graphql";

import type { TaskResultInput } from "@/__generated__/graphql";

import { TaskResultButtons } from "./TaskPanel/TaskResultButtons";
import { TaskResultForm } from "./TaskPanel/TaskResultForm";
import type { TaskRow } from "./taskText";
import { useTaskActions } from "./useTaskActions";

type Props = {
  task: { id: string; resultForm: NonNullable<TaskRow["resultForm"]> };
  /** Active queries the decision changes, refetched before `onDone`. */
  refetch: DocumentNode[];
  /** Runs once the task is marked done with the chosen result. */
  onDone: () => void;
};

/**
 * A task's result form outside its panel, such as Approve and Reject on the time off it asks to
 * decide: buttons or choices, and a comment when the chosen option requires one.
 */
export function TaskDecision({ task, refetch, onDone }: Props) {
  const actions = useTaskActions({ refetch });
  const [chosenCode, setChosenCode] = useState<string | null>(null);
  const form = task.resultForm;
  const finish = (result: TaskResultInput) =>
    void actions.markDone(task.id, result).then((done) => done && onDone());

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
