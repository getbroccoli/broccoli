import type { TimeOffTypeColour, TimeOffTypeIcon } from "@/__generated__/graphql";
import type { RecordDescription, RecordField } from "@/features/records";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

/** A time off type's fields, and its policies', as its history shows them. */
export const TIME_OFF_TYPE_DESCRIPTION: RecordDescription = {
  titleField: "name",
  fields: [
    historyField("name", t("settings.timeOffType.name")),
    historyField("icon", t("settings.timeOffType.icon"), (value) =>
      t(`settings.timeOffType.icons.${value.toUpperCase() as TimeOffTypeIcon}`),
    ),
    historyField("colour", t("settings.timeOffType.colour"), (value) =>
      t(`settings.timeOffType.colours.${value.toUpperCase() as TimeOffTypeColour}`),
    ),
    historyField("reasonVisibleToColleagues", t("settings.timeOffType.showReason"), yesNo),
    // History shows the policy's name stored with its id.
    historyField("policy", t("settings.timeOffType.policy")),
    historyField("policyName", t("settings.timeOffType.policyName")),
    historyField("policyBalance", t("settings.timeOffType.counts"), (value) =>
      t(BALANCE_LABELS[value as keyof typeof BALANCE_LABELS] ?? "settings.timeOff.noPolicy"),
    ),
    historyField("allowanceDays", t("settings.timeOffType.allowance"), (value) =>
      formatDays(Number(value)),
    ),
    historyField("bankHolidays", t("settings.timeOffType.bankHolidaysOnTop"), (value) =>
      yesNo(String(value === "bank_holidays_on_top_of_allowance")),
    ),
  ],
};

function historyField(
  key: string,
  label: string,
  format: (value: string) => string = (value) => value,
): RecordField {
  return { key, label, editor: "text", format, historyOnly: true };
}

function yesNo(value: string): string {
  return t(value === "true" ? "settings.timeOffType.yes" : "settings.timeOffType.no");
}

const BALANCE_LABELS = {
  balance_from_allowance: "settings.timeOff.fromBalance",
  unlimited_balance: "settings.timeOff.unlimited",
  no_balance: "settings.timeOff.doesNotCount",
} as const;
