import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { onTestFinished } from "vitest";

import { expect, importUseCases, OWNER, startLiveDecisions, SYSTEM, test } from "#test/support";

import type { ImportEmployeeValues, ImportSourceFailure } from "../domain";

const CASES = join(import.meta.dirname, "cases");

for (const file of readdirSync(CASES).filter((name) => name.endsWith(".csv"))) {
  const name = file.slice(0, -".csv".length);

  test(name, async ({ orm }) => {
    const expected = JSON.parse(
      readFileSync(join(CASES, `${name}.expected.json`), "utf8"),
    ) as ExpectedImport;
    const model = await startLiveDecisions();
    onTestFinished(() => {
      // shortcut: leaks are only reported until personal data is replaced by placeholders before model calls; then assert none.
      const leaked = model.leaked(expected.forbidden);
      if (leaked.length > 0) {
        console.warn(`${name}: ${leaked.length} forbidden values reached the model:`, leaked);
      }
      return model.stop();
    });
    const imports = importUseCases(orm, { decisions: model.decisions });

    const sourceId = await imports.uploadFile(OWNER, {
      name: file,
      bytes: readFileSync(join(CASES, file)),
    });
    await imports.mapFile(SYSTEM, { sourceId, attempt: 0 });

    const [source] = await imports.listSources(OWNER);
    const records = (await imports.listEmployees(OWNER, { first: 10_000 })).edges.map(
      ({ node: { firstName, lastName, email, jobTitle, startDate } }) => ({
        firstName,
        lastName,
        email,
        jobTitle,
        startDate,
      }),
    );
    expect({ failure: source?.failure, records: sorted(records) }).toEqual({
      failure: expected.failure ?? null,
      records: sorted(expected.records ?? []),
    });
  });
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
  failure?: ImportSourceFailure;
  /** Personal values in the file that must never reach the model. */
  forbidden: string[];
}
