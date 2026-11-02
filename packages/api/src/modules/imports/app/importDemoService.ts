import type { Transact, Tx } from "../../../core/db";
import { createSetupStepService, type DemoStart } from "../../../core/instance";
import type { SecurityContext } from "../../../core/security";
import { deleteImport } from "./importLifecycleService";
import { requireImportAccess } from "./requireImportAccess";

const setupSteps = createSetupStepService();

/** Writes the demo company inside the caller's transaction; the demo module provides it. */
export type DemoFill = (tx: Tx) => Promise<void>;

/** The demo company instead of the import: setup's import step left with the demo's people. */
export interface ImportDemoService {
  /**
   * Leaves the import step of setup with the demo company, in one transaction so the step only
   * moves once the demo company is in; the import is deleted, so none of its people are added.
   */
  startDemo: (ctx: SecurityContext) => Promise<void>;
  /**
   * The demo start for setup's demo: prepares the demo company outside any transaction and
   * returns its start, which completes the import step and fills the company in the caller's.
   */
  prepareDemoStart: () => Promise<DemoStart>;
}

export function createImportDemoService({
  transact,
  prepareDemoFill,
}: {
  transact: Transact;
  /** Reads what the demo company needs, then returns its fill for the caller's transaction. */
  prepareDemoFill: () => Promise<DemoFill>;
}): ImportDemoService {
  return {
    async startDemo(ctx) {
      requireImportAccess(ctx);
      const start = await prepareDemoStart(prepareDemoFill);
      await transact((tx) => start(ctx, tx));
    },
    prepareDemoStart: () => prepareDemoStart(prepareDemoFill),
  };
}

async function prepareDemoStart(prepareDemoFill: () => Promise<DemoFill>): Promise<DemoStart> {
  const fillDemo = await prepareDemoFill();
  return async (ctx, tx) => {
    requireImportAccess(ctx);
    if (await setupSteps.completeImportStep(ctx, tx)) {
      await deleteImport(tx);
      await fillDemo(tx);
    }
  };
}
