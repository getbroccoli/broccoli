import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";
import { formatCalendarDate } from "@/lib/formatDate";

import type { EmployeeFieldKey } from "./employeeDraft";
import { ManagerPicker } from "./ManagerPicker";

/** The employee's fields, by panel section, as the panel and its history show them. */
export const EMPLOYEE_DESCRIPTION = {
  titleField: "firstName",
  fields: [
    textField("jobTitle", "people.panel.section.job"),
    {
      key: "manager",
      label: t("people.panel.field.manager"),
      section: t("people.panel.section.job"),
      editor: ManagerPicker,
      // History keeps the manager's name; the panel shows its id by name itself.
      format: (name) => name,
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
