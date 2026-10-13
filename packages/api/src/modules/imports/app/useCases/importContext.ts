import type { Orm } from "../../../../core/db";
import type { EventBus } from "../../../../core/events";
import type { Logger } from "../../../../core/logger";
import type { SecretBox } from "../../../../core/secrets";
import type { SlackClient } from "../../../../integrations/slack";
import type { ImportRepository } from "../../db";

/** What the import use cases share. */
export interface ImportContext {
  orm: Orm;
  eventBus: EventBus;
  logger: Logger;
  secretBox: SecretBox;
  slack: SlackClient;
  imports: ImportRepository;
}
