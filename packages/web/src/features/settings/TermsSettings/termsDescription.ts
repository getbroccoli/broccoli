import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

/** The terms' fields as their history shows them; only the name so far. */
export const TERMS_DESCRIPTION: RecordDescription = {
  titleField: "name",
  createdAs: {
    TIME_OFF_TURNED_ON: "records.history.setUp",
    EDITED_DIRECTLY: "records.history.createdAs",
  },
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
