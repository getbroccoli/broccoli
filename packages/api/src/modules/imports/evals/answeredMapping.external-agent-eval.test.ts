import { readdirSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";

import { afterAll } from "vitest";

import {
  expect,
  importUseCases,
  type LiveExternalAgentAnswers,
  OWNER,
  SETUP_EXTERNAL_AGENT,
  SETUP_HOLDER,
  startLiveExternalAgentAnswers,
  test,
} from "#test/support";

import type { ImportEmployeeValues, ImportSource } from "../domain";

const CASES = join(import.meta.dirname, "cases");
let totalCost = 0;

afterAll(() => {
  console.info(`Agent model cost of the run: ${dollars(totalCost)}`);
});

test.for(caseNames())("%s", async (file, { orm, transact, onTestFinished }) => {
  const { name } = parse(file);
  const expected = readExpected(name);
  const agent = startLiveExternalAgentAnswers();
  onTestFinished(() => reportModelUse(name, agent, expected.forbidden));
  const imports = importUseCases(orm);
  const bytes = readFileSync(join(CASES, file));
  const sheets = await imports.answeredMapping.readStaffUpload(SETUP_HOLDER, bytes);
  const sourceId = await transact((tx) =>
    imports.answeredMapping.addAnsweredSource(SETUP_HOLDER, tx, { name: file, bytes, sheets }),
  );

  const questions = await transact((tx) =>
    imports.answeredMapping.readMappingQuestions(SETUP_EXTERNAL_AGENT, tx, sourceId),
  );
  const answers = await agent.answer(questions);
  await transact((tx) =>
    imports.answeredMapping.answerMapping(SETUP_EXTERNAL_AGENT, tx, sourceId, answers),
  );

  const [source] = await imports.reads.listSources(OWNER);
  const { edges } = await imports.reads.listEmployeeRecords(OWNER, { sourceId, first: 10_000 });
  expect({
    failure: source?.failure,
    records: sorted(edges.map(({ node }) => valuesOf(node))),
  }).toEqual({ failure: expected.failure ?? null, records: sorted(expected.records ?? []) });
});

/** The import evals' cases: a staff file with its expected result beside it. */
function caseNames(): string[] {
  return readdirSync(CASES).filter((file) => file.endsWith(".csv") || file.endsWith(".xlsx"));
}

function readExpected(name: string): ExpectedImport {
  return JSON.parse(readFileSync(join(CASES, `${name}.expected.json`), "utf8")) as ExpectedImport;
}

function reportModelUse(name: string, agent: LiveExternalAgentAnswers, forbidden: string[]): void {
  totalCost += agent.cost();
  console.info(`${name}: agent model cost ${dollars(agent.cost())}`);
  expect(agent.leaked(forbidden)).toEqual([]);
}

function valuesOf({
  firstName,
  lastName,
  email,
  jobTitle,
  startDate,
}: ImportEmployeeValues): ImportEmployeeValues {
  return { firstName, lastName, email, jobTitle, startDate };
}

function dollars(cost: number): string {
  return `$${cost.toFixed(6)}`;
}

/** Records in a fixed order, so the comparison ignores the order they are listed in. */
function sorted(records: ImportEmployeeValues[]): ImportEmployeeValues[] {
  return records.toSorted((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function sortKey({ firstName, lastName, email, jobTitle, startDate }: ImportEmployeeValues) {
  return [firstName, lastName, email, jobTitle, startDate].join("\u0000");
}

/** What a case's file must become: its records, or the reason it fails. */
interface ExpectedImport {
  records?: ImportEmployeeValues[];
  failure?: NonNullable<ImportSource["failure"]>;
  /** Personal values in the file that must never reach the model. */
  forbidden: string[];
}
