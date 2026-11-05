import { ApplicationError } from "../../../core/applicationError";
import { createRecordHistoryService } from "../../../core/records";
import type { SecurityContext } from "../../../core/security";
import { parseUuid } from "../../../utils";
import { timeOffPolicyRepository, timeOffSettingsRepository } from "../db";
import { readOneTypeSettings, type TimeOffTypeSettingsDependencies } from "./timeOffTypeSettings";

const history = createRecordHistoryService();

/**
 * Deletes a company's own time off type that nobody has ever had, with its policies; its history
 * stays readable. Refuses Broccoli's own types and anything that was used.
 */
export async function deleteTimeOffType(
  dependencies: TimeOffTypeSettingsDependencies,
  ctx: SecurityContext,
  input: { id: string },
): Promise<{ id: string }> {
  ctx.require("MANAGE_WORKSPACE");
  const id = parseUuid(input.id);
  return dependencies.transact(async (tx) => {
    // Taken first, so no terms can link one of its policies while it is checked and deleted.
    await timeOffPolicyRepository(tx).lockTermsLinks();
    const settings = id && (await readOneTypeSettings(dependencies, tx, id));
    if (!settings) {
      throw new ApplicationError("NOT_FOUND", "The time off type does not exist.");
    }
    if (settings.timeOffType.typeKey !== null) {
      throw new ApplicationError("CONFLICT", "Broccoli's own time off types can't be deleted.");
    }
    if (!settings.canDelete) {
      throw new ApplicationError(
        "CONFLICT",
        "This time off type has been used, so it can't be deleted.",
      );
    }
    await timeOffSettingsRepository(tx).deleteType(settings.timeOffType.id);
    await history.append(ctx, tx, {
      recordType: "time_off_type",
      operation: "DELETED",
      cause: { kind: "EDITED_DIRECTLY" },
      records: [
        {
          recordId: settings.timeOffType.id,
          changes: [{ field: "name", oldValue: settings.timeOffType.name, newValue: null }],
        },
      ],
    });
    const deletedPolicyIds = settings.policies.map((policy) => policy.id);
    tx.publish("timeOff.time_off_type_deleted", {
      timeOffTypeId: settings.timeOffType.id,
      deletedPolicyIds,
    });
    return { id: settings.timeOffType.id };
  });
}
