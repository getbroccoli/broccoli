import type { Orm } from "../../../../core/db";
import type { EventBus } from "../../../../core/events";
import type { SlackUseCases } from "../../../slack";
import type { ImportRepository } from "../../db";

/** What the Slack module offers the import. */
export type SlackReader = Pick<SlackUseCases, "readSlackMembers" | "isCurrentSlackConnection">;

/** What the import use cases share. */
export interface ImportContext {
  orm: Orm;
  eventBus: EventBus;
  slack: SlackReader;
  imports: ImportRepository;
}
