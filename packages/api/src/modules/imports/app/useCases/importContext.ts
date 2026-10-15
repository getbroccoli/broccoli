import type { Decisions } from "../../../../core/ai/decisions";
import type { Orm, Transact } from "../../../../core/db";
import type { JobQueue } from "../../../../core/jobs";
import type { Logger } from "../../../../core/logger";
import type { SlackConnectionService } from "../../../slack";
import type { ImportRepository } from "../../db";

/** What the Slack module offers the import. */
export type SlackReader = Pick<
  SlackConnectionService,
  "readSlackMembers" | "isCurrentSlackConnection"
>;

/** What the import use cases share. */
export interface ImportContext {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  slack: SlackReader;
  /** The model that maps files; null where the instance has no model key. */
  decisions: Decisions | null;
  jobs: JobQueue;
  imports: ImportRepository;
}
