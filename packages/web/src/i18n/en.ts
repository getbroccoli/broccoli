import { appEn } from "./en/app";
import { authEn } from "./en/auth";
import { demoEn } from "./en/demo";
import { externalAgentsEn } from "./en/externalAgents";
import { importsEn } from "./en/imports";
import { invitesEn } from "./en/invites";
import { mcpAgentsEn } from "./en/mcpAgents";
import { navEn } from "./en/nav";
import { notFoundEn } from "./en/notFound";
import { peopleEn } from "./en/people";
import { recordsEn } from "./en/records";
import { settingsEn } from "./en/settings";
import { setupEn } from "./en/setup";
import { setupTimeOffEn } from "./en/setupTimeOff";
import { setupWhoEn } from "./en/setupWho";
import { tableEn } from "./en/table";
import { tasksEn } from "./en/tasks";
import { termsEn } from "./en/terms";
import { timeOffEn } from "./en/timeOff";
import { todayEn } from "./en/today";
import { workspaceEn } from "./en/workspace";

/** English copy, one file per key prefix under `en/`. Every user-facing string is read through `t()`. */
export const en = {
  ...appEn,
  ...authEn,
  ...setupEn,
  ...setupTimeOffEn,
  ...setupWhoEn,
  ...importsEn,
  ...externalAgentsEn,
  ...mcpAgentsEn,
  ...workspaceEn,
  ...navEn,
  ...demoEn,
  ...peopleEn,
  ...invitesEn,
  ...recordsEn,
  ...tableEn,
  ...tasksEn,
  ...notFoundEn,
  ...settingsEn,
  ...termsEn,
  ...timeOffEn,
  ...todayEn,
} as const;
