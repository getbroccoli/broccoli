import { requireAgentWriteScope } from "../../../core/agentAccess";
import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { createWriteModeService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { timeOffPolicyRepository } from "../db";
import type { BookedTimeOff, BookingInput, BookTimeOffService } from "./bookTimeOffService";

/** How a person's own time off of a type is saved: booked straight away, requested, or not at all. */
export type OwnTimeOffMode = "booked_straight_away" | "requested_with_approval" | "refused";

/** One's own time off, with the total cost the person was shown. */
export type OwnTimeOffInput = Omit<BookingInput, "employeeId" | "expectedDays"> & {
  expectedDays: number;
};

const writeModes = createWriteModeService();

/**
 * How the caller's own time off of each type would be saved, by type id: someone who may only ask
 * books a type nobody approves straight away.
 */
export async function ownTimeOffModes(
  orm: Orm,
  ctx: SecurityContext,
  timeOffTypeIds: readonly string[],
): Promise<Map<string, OwnTimeOffMode>> {
  const employeeId = ctx.user?.employeeId;
  const mode = employeeId ? await writeModeOf(ctx, employeeId) : "refused";
  const types = await timeOffPolicyRepository(orm).findAllTypes();
  const approved = new Set(types.filter((type) => type.approvalProcessKey).map(({ id }) => id));
  return new Map(
    timeOffTypeIds.map((id) => [
      id,
      mode === "request" && !approved.has(parseUuid(id) ?? id)
        ? "booked_straight_away"
        : OWN_MODES[mode],
    ]),
  );
}

/**
 * Saves the caller's own time off as its mode says: booked straight away, or requested, which
 * refuses whoever may not ask for it.
 */
export async function saveOwnTimeOff(
  orm: Orm,
  services: {
    bookTimeOff: BookTimeOffService["bookTimeOff"];
    requestTimeOff: (ctx: SecurityContext, input: BookingInput) => Promise<BookedTimeOff>;
  },
  ctx: SecurityContext,
  input: OwnTimeOffInput,
): Promise<BookedTimeOff> {
  const employeeId = ctx.user?.employeeId;
  if (!employeeId) {
    throw new ApplicationError("FORBIDDEN", "You have no employee record in Broccoli.");
  }
  requireAgentWriteScope(ctx);
  const booking = { ...input, employeeId };
  const modes = await ownTimeOffModes(orm, ctx, [input.timeOffTypeId]);
  return modes.get(input.timeOffTypeId) === "booked_straight_away"
    ? services.bookTimeOff(ctx, booking)
    : services.requestTimeOff(ctx, booking);
}

const OWN_MODES = {
  direct: "booked_straight_away",
  request: "requested_with_approval",
  refused: "refused",
} as const satisfies Record<string, OwnTimeOffMode>;

async function writeModeOf(ctx: SecurityContext, employeeId: string) {
  const modes = await writeModes.writeModes(ctx, "time_off", "create", [employeeId]);
  return modes.get(employeeId) ?? "refused";
}
