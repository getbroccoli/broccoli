import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

import { termsChangeSentence } from "./termsHistoryText";

/** The terms' fields as their history shows them: the name, and sentences for the week and rules. */
export const TERMS_DESCRIPTION: RecordDescription = {
  titleField: "name",
  createdAs: {
    TIME_OFF_TURNED_ON: "records.history.setUp",
    EDITED_DIRECTLY: "records.history.createdAs",
  },
  changedAs: termsChangeSentence,
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
