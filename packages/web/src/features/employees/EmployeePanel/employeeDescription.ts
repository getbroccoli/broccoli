import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";

import type { EmployeeFieldKey } from "./employeeDraft";
import { EmployeePicker } from "../EmployeePicker";
import { PermissionProfilePicker } from "./PermissionProfilePicker";

const PROFILE_LABELS: Partial<Record<string, string>> = {
  EMPLOYEE: t("people.panel.permissionProfile.employee"),
  ADMIN: t("people.panel.permissionProfile.admin"),
  OWNER: t("people.panel.permissionProfile.owner"),
};

/** The employee's fields, by panel section, as the panel and its history show them. */
export const EMPLOYEE_DESCRIPTION = {
  titleField: "firstName",
  fields: [
    textField("jobTitle", "people.panel.section.job"),
    {
      key: "manager",
      label: t("people.panel.field.manager"),
      section: t("people.panel.section.job"),
      editor: EmployeePicker,
      // History shows the manager's name stored with the id; the panel looks the id up itself.
      format: (id) => id,
    },
    {
      key: "startDate",
      label: t("people.panel.field.startDate"),
      section: t("people.panel.section.job"),
      editor: "date",
      format: (value) => formatCalendarDate(value) ?? value,
    },
    textField("email", "people.panel.section.contact"),
    textField("firstName", "people.panel.section.personal"),
    textField("lastName", "people.panel.section.personal"),
    {
      key: "permissionProfile",
      label: t("people.panel.field.permissionProfile"),
      section: t("people.panel.section.access"),
      editor: PermissionProfilePicker,
      format: (value) => PROFILE_LABELS[value] ?? value,
    },
  ],
} satisfies RecordDescription;

function textField(
  key: EmployeeFieldKey,
  section:
    "people.panel.section.job" | "people.panel.section.contact" | "people.panel.section.personal",
): RecordDescription["fields"][number] {
  return {
    key,
    label: t(`people.panel.field.${key}`),
    section: t(section),
    editor: "text",
    format: (value) => value,
  };
}
