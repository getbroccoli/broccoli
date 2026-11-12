import type { Orm } from "../../src/core/db";
import { processRepository } from "../../src/modules/processes/db";
import type { ProcessDefinition } from "../../src/modules/processes/domain";
import { testTransactor } from "./testTransactor";

/** A process with its first published version active, without invoking use cases or events. */
export function seedProcess(
  orm: Orm,
  {
    key,
    definition,
    turnedOn = true,
  }: {
    key: string;
    definition: ProcessDefinition;
    turnedOn?: boolean;
  },
): Promise<{ id: string; key: string }> {
  return testTransactor(orm)((tx) =>
    processRepository(tx).insertProcess({
      key,
      name: key,
      description: "Test process",
      definition,
      turnedOnAt: turnedOn ? new Date() : null,
    }),
  );
}
