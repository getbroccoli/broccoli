import type { SignIn } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

interface StepDefinition {
  id: string;
  title: MessageKey;
  /** The pages of a step that has more than one, in order. */
  pages?: readonly { id: string; title: MessageKey }[];
}

const OWNER = { id: "owner", title: "setup.owner.title" } as const satisfies StepDefinition;
const COMPANY = { id: "company", title: "setup.company.title" } as const satisfies StepDefinition;
const PEOPLE = {
  id: "people",
  title: "setup.import.title",
  // Both pages belong to the server's `import` step, until Approve.
  pages: [
    { id: "import", title: "setup.import.gather" },
    { id: "review", title: "setup.review.title" },
  ],
} as const satisfies StepDefinition;

/**
 * The setup steps in order, each with the copy key of its title. A self-hosted owner
 * creates their account last; a managed one signed up before setup.
 */
const SETUP_STEPS = {
  PASSWORD: [COMPANY, PEOPLE, OWNER],
  MANAGED: [OWNER, COMPANY, PEOPLE],
} as const satisfies Record<SignIn, readonly StepDefinition[]>;

type Step = typeof OWNER | typeof COMPANY | typeof PEOPLE;

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
export function stepViews(current: SetupStepId, signIn: SignIn): StepView[] {
  const steps: readonly StepDefinition[] = SETUP_STEPS[signIn];
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
