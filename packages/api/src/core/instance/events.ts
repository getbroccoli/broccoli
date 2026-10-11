declare module "../events" {
  interface DomainEvents {
    /** The instance got its owner: by self-hosted setup or managed sign-in. */
    "instance.owner_claimed": { userId: string; email: string };
  }
}

export {};
