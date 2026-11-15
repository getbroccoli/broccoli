import type { Orm } from "../../src/core/db";
import type { JobQueue, Jobs } from "../../src/core/jobs";
import { createLogger } from "../../src/core/logger";
import { createNotifications } from "../../src/core/notifications";
import { processesModule } from "../../src/core/processes";
import { taskEmailTemplates, taskRecordType } from "../../src/core/tasks";
import { createNotificationPeopleAdapter, employeeRecordType } from "../../src/modules/employees";
import type { CalendarDate } from "../../src/utils";
import { fakeMail, type FakeMail } from "./fakeMail";
import { processService, transactWithProcesses } from "./processService";
import { companyService, mailSettings } from "./services";
import { SYSTEM } from "./testSecurityContext";

/** Real notification processes with a collecting queue, or the server's queue for an end-to-end test. */
export function notificationFlow(
  orm: Orm,
  {
    today,
    mail = fakeMail(),
    mailSettings: settings = {},
    jobs: suppliedJobs,
  }: {
    today: () => CalendarDate;
    mail?: FakeMail;
    mailSettings?: Omit<NonNullable<Parameters<typeof mailSettings>[1]>, "mail">;
    jobs?: JobQueue;
  },
) {
  const queued: QueuedNotificationJob[] = [];
  const jobs: JobQueue = suppliedJobs ?? {
    send: (_tx, name, payload) => {
      if (name !== "processes.startRunsAfterCommit" && name !== "notifications.send") {
        throw new Error(`Unexpected job: ${name}`);
      }
      queued.push({ name, payload } as QueuedNotificationJob);
      return Promise.resolve();
    },
  };
  const logger = createLogger("silent");
  const mailChoice = mailSettings(orm, { ...settings, mail });
  const people = createNotificationPeopleAdapter({ orm });
  const notifications = createNotifications({
    jobs,
    logger,
    recordTypes: { employee: employeeRecordType(orm), task: taskRecordType(orm) },
    emailTemplates: taskEmailTemplates({ orm, readEmployeeNames: people.readEmployeeNames }),
    people,
    readMailer: () => mailChoice.readMailer(SYSTEM),
    readCompanyName: async () => (await companyService(orm).readStoredCompany(SYSTEM)).name ?? "",
  });
  const actions = notifications.actions;
  const transact = transactWithProcesses(orm, { today, jobs, actions });
  const processes = processService(orm, { today, transact, jobs, actions });
  const startJob = processesModule({ logger, processes }).jobs!["processes.startRunsAfterCommit"]!;
  const sendJob = notifications.jobs["notifications.send"]!;
  return {
    transact,
    queuedJobs: queued,
    mail,
    processes,
    sendJob,
    async deliver(): Promise<Jobs["notifications.send"][]> {
      const sent: Jobs["notifications.send"][] = [];
      while (queued.length > 0) {
        const job = queued.shift()!;
        if (job.name === "processes.startRunsAfterCommit") {
          await startJob.run(job.payload);
        } else {
          sent.push(job.payload);
          await sendJob.run(job.payload);
        }
      }
      return sent;
    },
  };
}

type QueuedNotificationJob = {
  [Name in "processes.startRunsAfterCommit" | "notifications.send"]: {
    name: Name;
    payload: Jobs[Name];
  };
}["processes.startRunsAfterCommit" | "notifications.send"];
