import type { MessageKey } from "@/i18n";

interface StepDefinition {
  id: string;
  title: MessageKey;
  /** The pages of a step that has more than one, in order. */
  pages?: readonly { id: string; title: MessageKey }[];
}

/** The setup steps in order, each with the copy key of its title. */
const SETUP_STEPS = [
  { id: "owner", title: "setup.owner.title" },
  { id: "company", title: "setup.company.title" },
  {
    id: "people",
    title: "setup.import.title",
    // Both pages belong to the server's `import` step, until Approve.
    pages: [
      { id: "import", title: "setup.import.gather" },
      { id: "review", title: "setup.review.title" },
    ],
  },
] as const satisfies readonly StepDefinition[];

type Step = (typeof SETUP_STEPS)[number];

/** A setup page: a step's own page, or one of its pages. */
export type SetupStepId =
  | Exclude<Step, { pages: unknown }>["id"]
  | Extract<Step, { pages: unknown }>["pages"][number]["id"];

export type StepState = "done" | "current" | "later";

export interface PageView {
  id: string;
  title: MessageKey;
  state: StepState;
}

export interface StepView extends PageView {
  /** The step's pages, shown while it is the current step. */
  pages: PageView[];
}

/** Each step and its pages with their state, seen from the current page. */
export function stepViews(current: SetupStepId): StepView[] {
  const order: string[] = SETUP_STEPS.flatMap((step: StepDefinition) =>
    step.pages ? step.pages.map(({ id }) => id) : [step.id],
  );
  const currentIndex = order.indexOf(current);
  const view = ({ id, title }: { id: string; title: MessageKey }, ids: string[]): PageView => ({
    id,
    title,
    state: stepState(
      ids.map((page) => order.indexOf(page)),
      currentIndex,
    ),
  });
  return SETUP_STEPS.map((step: StepDefinition) => {
    const pages = step.pages?.map((page) => view(page, [page.id])) ?? [];
    return { ...view(step, pages.length ? pages.map(({ id }) => id) : [step.id]), pages };
  });
}

/** Done once every page is behind the current one; current while one of them is it. */
function stepState(indexes: number[], currentIndex: number): StepState {
  if (indexes.includes(currentIndex)) {
    return "current";
  }
  return Math.max(...indexes) < currentIndex ? "done" : "later";
}
