// What agent access adds to core's shared registries.

declare module "../../events" {
  interface DomainEvents {
    /** A person's agent connection was allowed or ended; their open pages read it again. */
    "agentAccess.connection_changed": { userId: string };
  }
}

export {};
