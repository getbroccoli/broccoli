import type { ModuleDependencies, ModuleManifest } from "../moduleManifest";
import type { Notifications } from "./app";

// Public values.
export { createNotifications } from "./app";

// Public types.
export type { NotificationPeoplePort } from "./ports";

/** Telling people about their records: the notify action process steps run, and its email. */
export function notificationsModule({
  logger,
  notifications,
}: Pick<ModuleDependencies, "logger"> & { notifications: Notifications }): ModuleManifest {
  return {
    name: "notifications",
    jobs: notifications.jobs,
    events: {
      // Logged once the run commits, never for one a rollback dropped.
      "notifications.notify_decided": (decided) =>
        Promise.resolve(logger.info(decided, "Notify step decided")),
    },
  };
}
