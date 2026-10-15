import type { MessageKey } from "@/i18n";

/** The setup steps in order, each with the copy key of its title. */
const SETUP_STEPS = [
  { id: "owner", title: "setup.owner.title" },
  { id: "company", title: "setup.company.title" },
  { id: "import", title: "setup.import.title" },
  // A page of the server's `import` step: the owner reviews the import before Approve.
  { id: "review", title: "setup.review.title" },
] as const satisfies readonly { id: string; title: MessageKey }[];

export type SetupStepId = (typeof SETUP_STEPS)[number]["id"];

export type StepState = "done" | "current" | "later";

export interface StepView {
  id: SetupStepId;
  title: MessageKey;
  state: StepState;
}

/** Each step with its state, seen from the current step. */
export function stepViews(current: SetupStepId): StepView[] {
  const currentIndex = SETUP_STEPS.findIndex(({ id }) => id === current);
  return SETUP_STEPS.map((step, index) => ({ ...step, state: stepState(index, currentIndex) }));
}

function stepState(index: number, currentIndex: number): StepState {
  if (index < currentIndex) {
    return "done";
  }
  return index === currentIndex ? "current" : "later";
}
