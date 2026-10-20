import type { Mode } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

interface StepDefinition {
  id: string;
  title: MessageKey;
  /** The pages of a step that has more than one, in order. */
  pages?: readonly { id: string; title: MessageKey }[];
}

const OWNER = { id: "owner", title: "setup.owner.title" } as const satisfies StepDefinition;
const COMPANY = { id: "company", title: "setup.company.title" } as const satisfies StepDefinition;
const AI = { id: "ai", title: "setup.ai.title" } as const satisfies StepDefinition;
const PEOPLE = {
  id: "people",
  title: "setup.import.title",
  // Both pages, and Setup AI before them, belong to the server's `import` step, until Approve.
  pages: [
    { id: "import", title: "setup.import.gather" },
    { id: "review", title: "setup.review.title" },
  ],
} as const satisfies StepDefinition;
const READY = { id: "ready", title: "setup.ready.title" } as const satisfies StepDefinition;

/**
 * The setup steps in order, each with the copy key of its title. A self-hosted owner
 * picks how files are read with AI and creates their account last; a managed one keeps
 * its provided key, signed up before setup and sees what it added last.
 */
const SETUP_STEPS = {
  SELF_HOSTED: [COMPANY, AI, PEOPLE, OWNER],
  MANAGED: [COMPANY, PEOPLE, READY],
} as const satisfies Record<Mode, readonly StepDefinition[]>;

type Step = typeof OWNER | typeof COMPANY | typeof AI | typeof PEOPLE | typeof READY;

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
export function stepViews(current: SetupStepId, mode: Mode): StepView[] {
  const steps: readonly StepDefinition[] = SETUP_STEPS[mode];
  const order: string[] = steps.flatMap((step) =>
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
  return steps.map((step) => {
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
