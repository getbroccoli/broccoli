// What this module adds to core's shared registries.
import type { AddedPeople } from "./useCases/addApprovedPeople";
import type { MapFileJob } from "./useCases/fileSourceService";
import type { ReadOriginalFileJob } from "./useCases/originalFileReadService";

declare module "../../../core/records" {
  interface CauseKinds {
    /** People approved in the import, from a file or Slack, became employees. */
    ADDED_FROM_IMPORT: true;
  }
}

declare module "../../../core/events" {
  interface DomainEvents {
    /** The people the owner approved became employees. */
    "imports.people_added": AddedPeople;
    /** The owner let the external agent read a file in full; it waits for the agent now. */
    "imports.original_file_read_allowed": { sourceId: string };
  }
}

declare module "../../../core/jobs" {
  interface Jobs {
    "imports.mapFile": MapFileJob;
    "imports.readOriginalFile": ReadOriginalFileJob;
  }
}
