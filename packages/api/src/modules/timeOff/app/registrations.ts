// What this module adds to core's shared registries.

declare module "../../../core/jobs" {
  interface Jobs {
    "timeOff.ensureAllowances": Record<never, never>;
  }
}

export {};
