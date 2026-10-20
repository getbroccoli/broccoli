import type { ImportSource } from "./importSource";

/** How far gathering people is, as the import step and the setup review step wait on it. */
export interface ImportProgress {
  /** A file is still being read; setup approve is refused until it is done. */
  reading: boolean;
  /** The demo company may still replace the import: nothing is gathered or being read. */
  demoAvailable: boolean;
}

/** `employeeRecordCount` is the number of employee records of every source together. */
export function importProgress(
  sources: readonly ImportSource[],
  employeeRecordCount: number,
): ImportProgress {
  const reading = isReading(sources);
  return { reading, demoAvailable: !reading && employeeRecordCount === 0 };
}

/** Whether a file source is still being read. */
export function isReading(sources: readonly ImportSource[]): boolean {
  return sources.some(({ status }) => status === "mapping");
}
