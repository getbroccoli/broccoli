import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";

import type { EmployeeFieldKey } from "./employeeDraft";
import { EmployeePicker } from "../EmployeePicker";
import { PermissionProfilePicker } from "./PermissionProfilePicker";

const SIGN_IN_LABELS: Partial<Record<string, string>> = {
  NOT_INVITED: t("invites.state.notInvited"),
  INVITED: t("invites.state.pending"),
  JOINED: t("invites.state.joined"),
};

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
      key: "permissionProfiles",
      label: t("people.panel.field.permissionProfiles"),
      section: t("people.panel.section.access"),
      editor: PermissionProfilePicker,
      // The panel holds "EMPLOYEE,ADMIN"; history holds "EMPLOYEE, ADMIN".
      format: (value) =>
        value
          .split(",")
          .map((name) => PROFILE_LABELS[name.trim()] ?? name.trim())
          .join(", "),
    },
    {
      key: "signIn",
      label: t("people.panel.field.signIn"),
      section: t("people.panel.section.access"),
      editor: "text",
      format: (value) => SIGN_IN_LABELS[value] ?? value,
      historyOnly: true,
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
