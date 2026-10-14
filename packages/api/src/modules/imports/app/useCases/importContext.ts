import type { Transact } from "../../../../core/db";
import type { SlackConnectionService } from "../../../slack";
import type { ImportRepository } from "../../db";

/** What the Slack module offers the import. */
export type SlackReader = Pick<
  SlackConnectionService,
  "readSlackMembers" | "isCurrentSlackConnection"
>;

/** What the import use cases share. */
export interface ImportContext {
  transact: Transact;
  slack: SlackReader;
  imports: ImportRepository;
}
