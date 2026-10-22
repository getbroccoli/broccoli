import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, importUseCases, OWNER, startLiveDecisions, SYSTEM, test } from "#test/support";

import type { ImportEmployeeValues } from "../domain";

test.for(["title-row-semicolons", "simple"])(
  "original read preserves every person and field in %s",
  async (name, { orm, seed, onTestFinished }) => {
    const model = await startLiveDecisions();
    onTestFinished(async () => {
      console.info(`${name}: original read model cost $${model.cost().toFixed(6)}`);
      await model.stop();
    });
    const imports = importUseCases(orm, {
      originalFileReader: {
        readOriginalFile: (_source, request) => model.originalFileReader.readOriginalFile(request),
      },
    });
    const source = await seed.fileSource({
      content: readFileSync(join(import.meta.dirname, "cases", `${name}.csv`)),
      status: "mapped",
    });
    const expected = JSON.parse(
      readFileSync(join(import.meta.dirname, "cases", `${name}.expected.json`), "utf8"),
    ) as { records: ImportEmployeeValues[] };
    await imports.originalFileReads.allowOriginalFileRead(OWNER, source.id, "broccoli_ai");

    await imports.originalFileReads.readOriginalFile(SYSTEM, {
      sourceId: source.id,
      attempt: 1,
      aiSource: "broccoli_ai",
    });

    const { edges } = await imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id });
    expect(
      edges.map(({ node: { firstName, lastName, email, jobTitle, startDate } }) => ({
        firstName,
        lastName,
        email,
        jobTitle,
        startDate,
      })),
    ).toEqual(expected.records);
  },
);
