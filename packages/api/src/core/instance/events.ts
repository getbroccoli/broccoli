declare module "../events" {
  interface DomainEvents {
    /** The instance got its owner: by self-hosted setup or managed sign-in. */
    "instance.owner_claimed": { userId: string; email: string };
    /** Setup reached its last step: the instance is ready to use. */
    "instance.setup_completed": Record<string, never>;
  }
}

export {};
