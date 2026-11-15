// What this module adds to core's shared registries.

/** Who to tell: an employee field of the run's record, such as a task's "assignee". */
export interface NotifyParams {
  recipient: { kind: "record_employee"; field: string };
  /** A template a module registered, such as "tasks.task_assigned". */
  emailTemplateKey: string;
}

/** Why a notify step told nobody, or that it queued the email. */
export type NotifyOutcome = "queued" | "no_recipient_for_step" | "recipient_made_the_change";

declare module "../../processes" {
  interface ProcessActions {
    "notifications.notify": NotifyParams;
  }
}

declare module "../../jobs" {
  interface Jobs {
    /** Emails one notification, read as its record is when the job runs. */
    "notifications.send": {
      recipient: { employeeId: string };
      emailTemplateKey: string;
      record: { recordType: string; recordId: string };
      /** The run id and step key: the provider's idempotency key, the same on every retry. */
      key: string;
    };
  }
}

declare module "../../events" {
  interface DomainEvents {
    /** A notify step decided; logged once its run commits. */
    "notifications.notify_decided": {
      runId: string;
      stepKey: string;
      emailTemplateKey: string;
      outcome: NotifyOutcome;
    };
  }
}
