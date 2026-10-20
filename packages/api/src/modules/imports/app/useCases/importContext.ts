import type { Orm, Transact, Tx } from "../../../../core/db";
import type { Logger } from "../../../../core/logger";
import type { SlackConnectionService } from "../../../slack";
import type { ImportReader } from "../../db";

/** What the Slack module offers the import. */
export type SlackReader = Pick<
  SlackConnectionService,
  "readSlackMembers" | "isCurrentSlackConnection" | "readSlackPhoto"
>;

/** What the import use cases share. */
export interface ImportContext {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  slack: SlackReader;
  imports: ImportReader;
  /** Now; tests pass their own. */
  clock: () => Date;
  /** Reads what the demo company needs, then returns its fill for the caller's transaction. */
  prepareDemoFill: () => Promise<DemoFill>;
}

/** Writes the demo company inside the caller's transaction; the demo module provides it. */
export type DemoFill = (tx: Tx) => Promise<void>;
