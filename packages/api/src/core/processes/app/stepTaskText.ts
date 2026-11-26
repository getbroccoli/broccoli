import type { AskedByRule, TriggerEvent } from "../domain";
import type { RunSubject } from "../ports";

/** The text with `{firstName}` and the trigger event's `{event.<field>}` filled in. */
export function filled(
  text: string,
  subject: Pick<RunSubject, "firstName"> | null,
  event: TriggerEvent | null,
): string {
  return text
    .replaceAll("{firstName}", subject?.firstName ?? "them")
    .replaceAll(/\{event\.(\w+)\}/g, (_placeholder, field: string) => {
      const value = payloadOf(event)[field];
      return typeof value === "string" ? value : "";
    });
}

/** The employee the trigger event names as having asked, when the step says so. */
export function askerOf(
  rule: AskedByRule | null | undefined,
  event: TriggerEvent | null,
): string | null {
  if (!rule) return null;
  const value = payloadOf(event)[rule.field];
  return typeof value === "string" ? value : null;
}

function payloadOf(event: TriggerEvent | null): Record<string, unknown> {
  return (event?.payload ?? {}) as Record<string, unknown>;
}
