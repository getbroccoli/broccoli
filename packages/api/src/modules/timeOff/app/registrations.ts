// What this module adds to core's shared registries.
import type { AllowancesEnsured } from "./allowanceTriggers";

declare module "../../../core/events" {
  interface DomainEvents {
    /** The engine ran inside another module's change, which committed. */
    "timeOff.allowances_ensured": AllowancesEnsured;
  }
}
