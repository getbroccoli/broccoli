import { readdirSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";

import { afterAll } from "vitest";

import {
  expect,
  importUseCases,
  type LiveDecisions,
  OWNER,
  startLiveDecisions,
  SYSTEM,
  test,
} from "#test/support";

import type { ImportEmployeeValues, ImportSource } from "../domain";

const CASES = join(import.meta.dirname, "cases");
let totalCost = 0;

afterAll(() => {
  console.info(`Model cost of the run: ${dollars(totalCost)}`);
});

test.for(caseNames())("%s", async (file, { orm, onTestFinished }) => {
  const { name } = parse(file);
  const expected = readExpected(name);
  const model = await startLiveDecisions();
  onTestFinished(async () => {
    try {
      reportModelUse(name, model, expected.forbidden);
    } finally {
      await model.stop();
    }
  });
  const imports = importUseCases(orm, { decisions: model.decisions });

  const sourceId = await imports.files.uploadFile(OWNER, {
    name: file,
    bytes: readFileSync(join(CASES, file)),
  });
  await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });

  const [source] = await imports.reads.listSources(OWNER);
  const { edges } = await imports.reads.listEmployees(OWNER, { first: 10_000 });
  expect({
    failure: source?.failure,
    records: sorted(edges.map(({ node }) => valuesOf(node))),
  }).toEqual({ failure: expected.failure ?? null, records: sorted(expected.records ?? []) });
});

/** Each case is a staff file with its expected result beside it. */
function caseNames(): string[] {
  return readdirSync(CASES).filter((file) => /\.(csv|xlsx|pdf)$/.test(file));
}

function readExpected(name: string): ExpectedImport {
  return JSON.parse(readFileSync(join(CASES, `${name}.expected.json`), "utf8")) as ExpectedImport;
}

function reportModelUse(name: string, model: LiveDecisions, forbidden: string[]): void {
  model.requests().forEach((request, index) => {
    console.info(`${name}: request ${index + 1}\n${JSON.stringify(request, null, 2)}`);
  });
  const leaked = model.leaked(forbidden);
  totalCost += model.cost();
  console.info(`${name}: model cost ${dollars(model.cost())}`);
  expect(leaked).toEqual([]);
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
