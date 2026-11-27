import type { WhosOutTimeOff } from "./WhosOutGrid";

/** The viewer's open task on this time off that asks for a decision, such as approving it. */
export function decisionTaskOf(timeOff: WhosOutTimeOff): DecisionTask | null {
  return timeOff.myOpenTasks.find(hasResultForm) ?? null;
}

type OpenTask = WhosOutTimeOff["myOpenTasks"][number];
export type DecisionTask = OpenTask & { resultForm: NonNullable<OpenTask["resultForm"]> };

function hasResultForm(task: OpenTask): task is DecisionTask {
  return task.resultForm !== null && task.resultForm !== undefined;
}
