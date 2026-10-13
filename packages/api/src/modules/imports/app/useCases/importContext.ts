import type { Orm } from "../../../../core/db";
import type { EventBus } from "../../../../core/events";
import type { Logger } from "../../../../core/logger";
import type { Encryption } from "../../../../core/secrets";
import type { SlackApi, SlackAuthorization } from "../../../../integrations/slack";
import type { ImportRepository } from "../../db";

/** What the import use cases share. */
export interface ImportContext {
  orm: Orm;
  eventBus: EventBus;
  logger: Logger;
  encryption: Encryption;
  slackAuthorization: SlackAuthorization;
  slackApi: SlackApi;
  imports: ImportRepository;
}
