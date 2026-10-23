import type { ImportSource, ImportSourceState } from "../../src/modules/imports/domain";

/** All public source values for assertions; comparing instances alone cannot see their private state. */
export function importSourceValues(source: ImportSource): ImportSourceState {
  return {
    id: source.id,
    kind: source.kind,
    name: source.name,
    readAt: source.readAt,
    status: source.status,
    failure: source.failure,
    failureMessage: source.failureMessage,
    readBy: source.readBy,
    pickedUpByExternalAgentAt: source.pickedUpByExternalAgentAt,
    originalReadAllowedAt: source.originalReadAllowedAt,
    originalReadAiSource: source.originalReadAiSource,
  };
}
