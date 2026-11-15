import type { z } from "zod";

import type { Tx } from "../../db";
import type { SecurityContext } from "../../security";
import type { ProcessRunFields } from "../domain";

/** Actions an action step may name, by name, with their params; modules add theirs by declaration merging. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by declaration merging, like Jobs.
export interface ProcessActions {}

/** What an action is given when its step completes. */
export interface ProcessActionContext<Params> {
  /** The run, with its record, subject and the event that started it. */
  run: ProcessRunFields;
  step: { key: string };
  params: Params;
}

/** An action a module registers: the schema its step's params must match, and what it does. */
export interface ProcessActionRegistration<Params> {
  params: z.ZodType<Params>;
  /**
   * Trusted, as `ctx`, in the transaction the step completes in: writes in `tx` and jobs queued
   * in it only, never another transaction or outside I/O. Throwing rolls the transaction back.
   */
  run(ctx: SecurityContext, tx: Tx, context: ProcessActionContext<Params>): Promise<void>;
}

/** Registrations by action name, as a module or the composition root hands them to processes. */
export type ProcessActionRegistrations = {
  [Name in keyof ProcessActions]?: ProcessActionRegistration<ProcessActions[Name]>;
};

/** Every registered action by name, as processes looks one up for a step. */
export type RegisteredActions = Readonly<Record<string, ProcessActionRegistration<unknown>>>;
