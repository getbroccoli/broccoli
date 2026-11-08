import { redirect } from "@tanstack/react-router";

import type { Mode, SetupStep } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

/** The path of a setup page, or of the directory once setup is done. */
export type SetupPath =
  | "/setup/company"
  | "/setup/ai"
  | "/setup/import"
  | "/setup/import/review"
  | "/setup/time-off"
  | "/setup/who"
  | "/setup"
  | "/setup/ready"
  | "/people";

interface PageDefinition {
  id: string;
  title: MessageKey;
  path: SetupPath;
  /** The server's setup step the page belongs to. */
  step: SetupStep;
  /** A later server step at which the owner may still come back to the page. */
  reopensAt?: SetupStep;
}

interface StepDefinition {
  id: string;
  title: MessageKey;
  /** The pages of a step that has more than one, in order. */
  pages: readonly PageDefinition[];
}

const OWNER = {
  id: "owner",
  title: "setup.owner.title",
  path: "/setup",
  step: "OWNER",
} as const satisfies PageDefinition;
const COMPANY = {
  id: "company",
  title: "setup.company.title",
  path: "/setup/company",
  step: "COMPANY",
  reopensAt: "IMPORT",
} as const satisfies PageDefinition;
const AI = {
  id: "ai",
  title: "setup.ai.title",
  path: "/setup/ai",
  step: "IMPORT",
} as const satisfies PageDefinition;
const IMPORT = {
  id: "import",
  title: "setup.import.gather",
  path: "/setup/import",
  step: "IMPORT",
} as const satisfies PageDefinition;
const REVIEW = {
  id: "review",
  title: "setup.review.title",
  path: "/setup/import/review",
  step: "IMPORT",
} as const satisfies PageDefinition;
// Time off and Who come after Approve, so they belong to the server step of setup's last page.
const TIME_OFF_WITHOUT_OWNER = {
  id: "timeOff",
  title: "setup.timeOff.step",
  path: "/setup/time-off",
  step: "OWNER",
} as const satisfies PageDefinition;
const TIME_OFF_WITH_OWNER = {
  ...TIME_OFF_WITHOUT_OWNER,
  step: "READY",
} as const satisfies PageDefinition;
const WHO_WITHOUT_OWNER = {
  id: "who",
  title: "setup.who.step",
  path: "/setup/who",
  step: "OWNER",
} as const satisfies PageDefinition;
const WHO_WITH_OWNER = { ...WHO_WITHOUT_OWNER, step: "READY" } as const satisfies PageDefinition;
// Gathering and review, and Setup AI before them, belong to the server's `import` step, until Approve.
const PEOPLE = {
  id: "people",
  title: "setup.import.title",
  pages: [IMPORT, REVIEW],
} as const satisfies StepDefinition;
const READY = {
  id: "ready",
  title: "setup.ready.title",
  path: "/setup/ready",
  step: "READY",
} as const satisfies PageDefinition;

/** Where setup ends: the directory. */
const FINISHED: SetupPath = "/people";

type Page =
  | typeof OWNER
  | typeof COMPANY
  | typeof AI
  | typeof IMPORT
  | typeof REVIEW
  | typeof TIME_OFF_WITHOUT_OWNER
  | typeof WHO_WITHOUT_OWNER
  | typeof READY;

/** A setup page: a step's own page, or one of its pages. */
export type SetupStepId = Page["id"];

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
export function stepViews(current: SetupStepId, mode: Mode, ownerExists = false): StepView[] {
  const steps: readonly (PageDefinition | StepDefinition)[] = stepsOf(mode, ownerExists);
  const order = pagesOf(mode, ownerExists).map(({ id }) => id);
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
    const pages = "pages" in step ? step.pages.map((page) => view(page, [page.id])) : [];
    return { ...view(step, pages.length ? pages.map(({ id }) => id) : [step.id]), pages };
  });
}

/** The first page of a server step, or the directory once setup is done. */
export function setupStepPage(step: SetupStep, mode: Mode): SetupPath {
  if (step === "DONE") {
    return FINISHED;
  }
  const page = pagesOf(mode, step === "READY").find((candidate) => candidate.step === step);
  if (!page) {
    throw new Error(`${mode} setup has no page for the ${step} step`);
  }
  return page.path;
}

/** The page before `page`, when the owner may go back to it from there. */
export function previousPage(
  page: SetupStepId,
  mode: Mode,
  ownerExists = false,
): SetupPath | undefined {
  const pages = pagesOf(mode, ownerExists);
  const current = pageOf(page, mode, ownerExists);
  const previous = pages[pages.indexOf(current) - 1];
  return previous && isOpenAt(previous, current.step) ? previous.path : undefined;
}

/** The page after `page`, or the directory after the last one. */
export function nextPage(page: SetupStepId, mode: Mode, ownerExists = false): SetupPath {
  const pages = pagesOf(mode, ownerExists);
  return pages[pages.indexOf(pageOf(page, mode, ownerExists)) + 1]?.path ?? FINISHED;
}

/**
 * The gate of a setup page: sends a visitor who is neither signed in nor holding setup to
 * login, and anyone else to the page of the current step unless `page` is open at it.
 */
export function requireSetupPage<Me>(page: SetupStepId, { context, location }: Gate<Me>): void {
  if (!context.me && !context.holdsSetup) {
    throw loginRedirect(location.href);
  }
  const definition = pagesOf(context.mode, context.me !== null).find(({ id }) => id === page);
  if (!definition || !isOpenAt(definition, context.setupStep)) {
    throw redirect({ to: setupStepPage(context.setupStep, context.mode), replace: true });
  }
}

/** The gate of the app itself: a signed-in user once setup is done. Returns them. */
export function requireFinishedSetup<Me>({ context, location }: Gate<Me>): Me {
  if (!context.me && !context.holdsSetup) {
    throw loginRedirect(location.href);
  }
  if (context.setupStep !== "DONE") {
    throw redirect({ to: setupStepPage(context.setupStep, context.mode), replace: true });
  }
  // Setup ends by signing the new owner in, so only a signed-in user gets here.
  if (!context.me) {
    throw loginRedirect(location.href);
  }
  return context.me;
}

interface Gate<Me> {
  context: { me: Me | null; holdsSetup: boolean; setupStep: SetupStep; mode: Mode };
  location: { href: string };
}

function pagesOf(mode: Mode, ownerExists: boolean): readonly PageDefinition[] {
  const steps: readonly (PageDefinition | StepDefinition)[] = stepsOf(mode, ownerExists);
  return steps.flatMap((step) => ("pages" in step ? step.pages : [step]));
}

function pageOf(page: SetupStepId, mode: Mode, ownerExists: boolean): PageDefinition {
  const definition = pagesOf(mode, ownerExists).find(({ id }) => id === page);
  if (!definition) {
    throw new Error(`${mode} setup has no ${page} page`);
  }
  return definition;
}

function stepsOf(mode: Mode, ownerExists: boolean): readonly (PageDefinition | StepDefinition)[] {
  return [
    COMPANY,
    ...(mode === "SELF_HOSTED" ? [AI] : []),
    PEOPLE,
    ...(mode === "MANAGED" || ownerExists
      ? [TIME_OFF_WITH_OWNER, WHO_WITH_OWNER, READY]
      : [TIME_OFF_WITHOUT_OWNER, WHO_WITHOUT_OWNER, OWNER]),
  ];
}

function isOpenAt(page: PageDefinition, step: SetupStep): boolean {
  return page.step === step || page.reopensAt === step;
}

/** Done once every page is behind the current one; current while one of them is it. */
function stepState(indexes: number[], currentIndex: number): StepState {
  if (indexes.includes(currentIndex)) {
    return "current";
  }
  return Math.max(...indexes) < currentIndex ? "done" : "later";
}

function loginRedirect(href: string) {
  return redirect({ to: "/login", search: { redirect: href }, replace: true });
}
