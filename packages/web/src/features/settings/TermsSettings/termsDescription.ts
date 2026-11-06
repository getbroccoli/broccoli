import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

/** The terms' fields as their history shows them; only the name so far. */
export const TERMS_DESCRIPTION: RecordDescription = {
  titleField: "name",
  fields: [
    {
      key: "name",
      label: t("terms.history.name"),
      editor: "text",
      format: (value) => value,
      historyOnly: true,
    },
  ],
};
