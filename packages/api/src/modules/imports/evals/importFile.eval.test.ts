import { readdirSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";

import { afterAll } from "vitest";

import {
  expect,
  importUseCases,
  type LiveDecisions,
  OWNER,
  pdfCompletionInput,
  startLiveDecisions,
  SYSTEM,
  test,
} from "#test/support";

import { parseCompletionInput } from "../../../integrations/ai";
import type { ImportEmployeeValues, ImportSource } from "../domain";

const CASES = process.env.EVAL_CASES_DIR ?? join(import.meta.dirname, "cases");
const totals = { files: 0, exactFiles: 0, records: 0, exactRecords: 0, calls: 0, cost: 0 };

afterAll(() => {
  console.info(
    `Summary: ${totals.exactFiles}/${totals.files} files exact, ` +
      `${totals.exactRecords}/${totals.records} records exact, ` +
      `${totals.calls} model calls, cost ${dollars(totals.cost)}`,
  );
});

test.for(caseNames())("%s", { timeout: 360_000 }, async (file, { orm, onTestFinished }) => {
  const { name } = parse(file);
  const model = await startLiveDecisions();
  const actual: ImportResult = { failure: undefined, records: [], latencyMs: 0 };
  onTestFinished(async () => {
    try {
      reportCase(name, model, readExpected(name), actual);
    } finally {
      await model.stop();
    }
  });
  const imports = importUseCases(orm, {
    decisions: model.decisions,
    completions: model.completions,
  });
  const bytes = readFileSync(join(CASES, file));
  let sourceId: string;

  const started = performance.now();
  try {
    sourceId = await imports.files.uploadFile(OWNER, { name: file, bytes });
    await imports.files.mapFile(SYSTEM, { sourceId, attempt: 0 });
  } finally {
    actual.latencyMs = performance.now() - started;
  }

  const expected = readExpected(name);
  const [source] = await imports.reads.listSources(OWNER);
  const { edges } = await imports.reads.listEmployeeRecords(OWNER, { sourceId, first: 10_000 });
  actual.failure = source?.failure;
  actual.records = edges.map(({ node }) => valuesOf(node));
  expect({ failure: actual.failure, records: sorted(actual.records) }).toEqual({
    failure: expected.failure ?? null,
    records: sorted(expected.records ?? []),
  });
});

/** Each case is a staff file with its expected result beside it. */
function caseNames(): string[] {
  return readdirSync(CASES)
    .filter((file) => /\.(csv|xlsx|pdf)$/.test(file))
    .sort();
}

function readExpected(name: string): ExpectedImport {
  return JSON.parse(readFileSync(join(CASES, `${name}.expected.json`), "utf8")) as ExpectedImport;
}

function reportCase(
  name: string,
  model: LiveDecisions,
  expected: ExpectedImport,
  actual: ImportResult,
): void {
  const decisions = model.requests();
  const completions = model.completionRequests();
  const wanted = expected.records ?? [];
  const exact = exactRecordCount(actual.records, wanted);
  const calls = decisions.length + completions.length;
  totals.files += 1;
  totals.exactFiles += Number(
    actual.failure === (expected.failure ?? null) &&
      exact === wanted.length &&
      actual.records.length === wanted.length,
  );
  totals.records += wanted.length;
  totals.exactRecords += exact;
  totals.calls += calls;
  totals.cost += model.cost();
  decisions.forEach((request, index) => {
    console.info(`${name}: request ${index + 1}\n${JSON.stringify(request, null, 2)}`);
  });
  console.info(
    `${name}: ${calls} model calls, cost ${dollars(model.cost())}, ` +
      `upload and mapping ${actual.latencyMs.toFixed(0)} ms`,
  );
  console.info(`${name}: ${exact}/${wanted.length} records`);
  for (const request of completions) {
    expect(request.provider.zdr).toBe(true);
    expect(request.provider.data_collection).toBe("deny");
    const parts = request.messages.flatMap(({ content }) =>
      typeof content === "string" ? [] : content,
    );
    expect(parts.every(({ type }) => type === "text")).toBe(true);
    expect(() => parseCompletionInput(pdfCompletionInput(request))).not.toThrow();
  }
  expect(model.leaked(expected.forbidden ?? [])).toEqual([]);
}

/** Counts matching records once each, including when a file contains duplicates. */
function exactRecordCount(
  actual: ImportEmployeeValues[],
  expected: ImportEmployeeValues[],
): number {
  const remaining = actual.map(sortKey);
  return expected.reduce((exact, record) => {
    const index = remaining.indexOf(sortKey(record));
    if (index < 0) return exact;
    remaining.splice(index, 1);
    return exact + 1;
  }, 0);
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
  return records.toSorted((a, b) => {
    const left = sortKey(a);
    const right = sortKey(b);
    return left === right ? 0 : left < right ? -1 : 1;
  });
}

function sortKey(record: ImportEmployeeValues): string {
  return JSON.stringify(valuesOf(record));
}

interface ImportResult {
  records: ImportEmployeeValues[];
  failure: ImportSource["failure"] | undefined;
  latencyMs: number;
}

/** What a case's file must become: its records, or the reason it fails. */
interface ExpectedImport {
  records?: ImportEmployeeValues[];
  failure?: NonNullable<ImportSource["failure"]>;
  /** Personal values in the file that must never reach the model. */
  forbidden?: string[];
}
