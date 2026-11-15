// What agent access adds to core's shared registries.

declare module "../../events" {
  interface DomainEvents {
    /** A person's agent connection was allowed or ended; their open pages read it again. */
    "agentAccess.connection_changed": { userId: string };
    /** A person's agent called a tool and its line was recorded; their open pages read it again. */
    "agentAccess.activity_recorded": { userId: string };
  }
}

declare module "../../jobs" {
  interface Jobs {
    "agentAccess.deleteOldActivity": Record<never, never>;
  }
}

export {};
