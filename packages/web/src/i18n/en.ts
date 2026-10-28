import { appEn } from "./en/app";
import { authEn } from "./en/auth";
import { companyEn } from "./en/company";
import { demoEn } from "./en/demo";
import { externalAgentsEn } from "./en/externalAgents";
import { importsEn } from "./en/imports";
import { navEn } from "./en/nav";
import { notFoundEn } from "./en/notFound";
import { peopleEn } from "./en/people";
import { recordsEn } from "./en/records";
import { settingsEn } from "./en/settings";
import { setupEn } from "./en/setup";
import { tableEn } from "./en/table";
import { workspaceEn } from "./en/workspace";

/** English copy, one file per key prefix under `en/`. Every user-facing string is read through `t()`. */
export const en = {
  ...appEn,
  ...authEn,
  ...setupEn,
  ...importsEn,
  ...externalAgentsEn,
  ...workspaceEn,
  ...navEn,
  ...demoEn,
  ...peopleEn,
  ...recordsEn,
  ...tableEn,
  ...companyEn,
  ...notFoundEn,
  ...settingsEn,
} as const;
