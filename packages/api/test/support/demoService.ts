import type { Orm } from "../../src/core/db";
import { createDemoService } from "../../src/modules/demo";
import { testTransactor } from "./testTransactor";
import { deleteAllEmployees } from "./timeOffService";

export function demoService(orm: Orm) {
  const transact = testTransactor(orm);
  return createDemoService({ orm, transact, deleteAllEmployees: deleteAllEmployees(orm) });
}
